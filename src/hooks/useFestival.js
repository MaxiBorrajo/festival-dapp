import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  OWNER_WALLET,
  ERC20_ABI,
  NFT_ABI,
  SEPOLIA_CHAIN_ID,
  DEPLOY_BLOCK
} from '../contracts';
import { formatCost, rollTokenPrice, friendlyError } from '../lib/format';

const DEFAULT_MAX_PER_TX = 4;
const MAX_TICKETS_SCANNED = 100;
const MAX_EVENTS_SYNCED = 200;
const MIN_LOG_CHUNK = 2000;

const txKey = (account) => `festival_txs_${account.toLowerCase()}`;
const paidKey = (account) => `festival_paid_${account.toLowerCase()}`;

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Error guardando en localStorage:', e);
  }
};

// Fases del flujo de compra:
// idle → paying → confirmingPayment → awaitingMint → minting → confirmingMint → success
// `error` solo ocurre antes de pagar; si falla el mint se vuelve a awaitingMint con `error`.
export const BUSY_PHASES = ['paying', 'confirmingPayment', 'minting', 'confirmingMint'];
const IDLE_FLOW = { phase: 'idle', message: '', error: '', txHash: '', paid: null };

// Primer nombre de función que responda (p. ej. price() o PRICE())
const callFirst = async (contract, names) => {
  for (const name of names) {
    try {
      return await contract[name]();
    } catch {
      /* probar el siguiente */
    }
  }
  return null;
};

// Logs desde el bloque de creación hasta el último. Si el RPC rechaza el rango completo
// (límite de rango o de resultados), se divide a la mitad recursivamente.
const queryLogsRange = async (contract, filter, from, to) => {
  try {
    return await contract.queryFilter(filter, from, to);
  } catch (err) {
    if (to - from < MIN_LOG_CHUNK) throw err;
    const mid = Math.floor((from + to) / 2);
    const left = await queryLogsRange(contract, filter, from, mid);
    const right = await queryLogsRange(contract, filter, mid + 1, to);
    return [...left, ...right];
  }
};

const queryLogs = async (contract, filter, fromBlock = DEPLOY_BLOCK) => {
  const latest = await contract.runner.provider.getBlockNumber();
  return queryLogsRange(contract, filter, fromBlock, latest);
};

const MAX_ID_SCAN = 500;
const SCAN_BATCH = 25;
const METADATA_TIMEOUT_MS = 6000;

const ipfsToHttp = (url) =>
  typeof url === 'string' && url.startsWith('ipfs://')
    ? `https://ipfs.io/ipfs/${url.slice(7).replace(/^ipfs\//, '')}`
    : url;

// tokenURI -> metadata JSON (data:, ipfs:// o http). Devuelve { image, name } o null.
async function fetchTicketMetadata(nftContract, id) {
  try {
    const uri = await nftContract.tokenURI(id);
    if (!uri) return null;
    let json;
    if (uri.startsWith('data:application/json')) {
      const [head, body] = [uri.slice(0, uri.indexOf(',')), uri.slice(uri.indexOf(',') + 1)];
      json = JSON.parse(head.includes('base64') ? atob(body) : decodeURIComponent(body));
    } else {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), METADATA_TIMEOUT_MS);
      try {
        const res = await fetch(ipfsToHttp(uri), { signal: ctrl.signal });
        if (!res.ok) return null;
        json = await res.json();
      } finally {
        clearTimeout(timer);
      }
    }
    const image = ipfsToHttp(json.image || json.image_url || '');
    return image ? { image, name: json.name } : { image: null, name: json.name };
  } catch {
    return null;
  }
}

export function useFestival({ account, chainId, notify }) {
  const [token, setToken] = useState({ symbol: 'MPC', balance: '0', decimals: 18 });
  const [ethBalance, setEthBalance] = useState('0');
  const [nft, setNft] = useState({
    totalMinted: 0,
    maxSupply: 10000,
    priceWei: 1n,
    maxPerTx: DEFAULT_MAX_PER_TX,
    festivalDate: null,
    balance: 0
  });
  const [tickets, setTickets] = useState([]); // [{ id, used }]
  const [randomPrice, setRandomPrice] = useState(0);
  const [quantity, setQuantityState] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [flow, setFlow] = useState(IDLE_FLOW);

  const txRef = useRef([]);
  const loadSeq = useRef(0);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  const onSepolia = !!account && chainId === SEPOLIA_CHAIN_ID;
  const isBusy = BUSY_PHASES.includes(flow.phase);

  // ---------- Historial local ----------
  const commitTxs = useCallback(
    (next) => {
      txRef.current = next;
      setTransactions(next);
      if (account) writeJson(txKey(account), next);
    },
    [account]
  );

  const upsertTx = useCallback(
    (record) => {
      const rest = txRef.current.filter((t) => t.hash.toLowerCase() !== record.hash.toLowerCase());
      commitTxs([record, ...rest].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    },
    [commitTxs]
  );

  const setTxStatus = useCallback(
    (hash, status, extra = {}) => {
      commitTxs(
        txRef.current.map((t) =>
          t.hash.toLowerCase() === hash.toLowerCase() ? { ...t, status, ...extra } : t
        )
      );
    },
    [commitTxs]
  );

  const clearHistory = useCallback(() => commitTxs([]), [commitTxs]);

  // Cambio de cuenta: historial y pago pendiente de mint propios de esa cuenta
  useEffect(() => {
    setHasLoaded(false);
    setTickets([]);
    if (!account) {
      txRef.current = [];
      setTransactions([]);
      setFlow(IDLE_FLOW);
      return;
    }
    const stored = readJson(txKey(account), []);
    txRef.current = stored;
    setTransactions(stored);

    const paid = readJson(paidKey(account), null);
    setFlow(
      paid
        ? {
            ...IDLE_FLOW,
            phase: 'awaitingMint',
            paid,
            message: 'Ya pagaste tus tokens. Solo falta mintear tu entrada.'
          }
        : IDLE_FLOW
    );
  }, [account]);

  // ---------- Lectura de blockchain ----------
  const loadData = useCallback(
    async ({ reroll = true } = {}) => {
      if (!account || !window.ethereum || chainId !== SEPOLIA_CHAIN_ID) return;
      const mySeq = ++loadSeq.current;
      setIsLoading(true);
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const ethBal = await provider.getBalance(account);
        if (mySeq !== loadSeq.current) return;
        setEthBalance(Number(ethers.formatEther(ethBal)).toFixed(5));

        // Token ERC-20
        try {
          const tokenContract = new ethers.Contract(CONTRACT_ADDRESSES.token, ERC20_ABI, provider);
          const [symbol, decimals, bal] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.decimals(),
            tokenContract.balanceOf(account)
          ]);
          const formatted = ethers.formatUnits(bal, decimals);
          if (mySeq !== loadSeq.current) return;
          setToken({ symbol, decimals: Number(decimals), balance: formatted });
          if (reroll) setRandomPrice(rollTokenPrice(parseFloat(formatted)));
        } catch (tokenErr) {
          console.warn('Error leyendo token ERC-20:', tokenErr);
          notify?.('error', 'No se pudo leer el saldo del token. Revisa tu conexión y reintenta.');
        }

        // NFT
        const nftContract = new ethers.Contract(CONTRACT_ADDRESSES.nft, NFT_ABI, provider);
        try {
          const [minted, max, price, maxPerTx, festivalDate, myNfts] = await Promise.all([
            nftContract.totalMinted(),
            callFirst(nftContract, ['maxSupply', 'MAX_SUPPLY']),
            callFirst(nftContract, ['price', 'PRICE']),
            callFirst(nftContract, ['MAX_PER_TX']),
            callFirst(nftContract, ['festivalDate']),
            nftContract.balanceOf(account)
          ]);
          if (mySeq !== loadSeq.current) return;

          setNft({
            totalMinted: Number(minted),
            maxSupply: max !== null ? Number(max) : 10000,
            priceWei: price !== null ? BigInt(price) : 1n,
            maxPerTx: maxPerTx !== null ? Number(maxPerTx) : DEFAULT_MAX_PER_TX,
            festivalDate: festivalDate !== null ? Number(festivalDate) : null,
            balance: Number(myNfts)
          });

          // Tickets realmente en posesión: candidatos por Transfer, confirmados con ownerOf
          // y, si el RPC no devolvió todos, escaneo de IDs recientes.
          try {
            const isMine = async (id) => {
              try {
                const owner = await nftContract.ownerOf(id);
                return owner.toLowerCase() === account.toLowerCase();
              } catch {
                return false;
              }
            };

            let owned = new Set();
            try {
              const incoming = await queryLogs(nftContract, nftContract.filters.Transfer(null, account));
              const candidates = [...new Set(incoming.map((e) => Number(e.args[2])))].slice(-MAX_TICKETS_SCANNED);
              const flags = await Promise.all(candidates.map(isMine));
              candidates.forEach((id, i) => flags[i] && owned.add(id));
            } catch (logErr) {
              console.warn('No se pudieron leer los logs de Transfer:', logErr);
            }

            const expected = Number(myNfts);
            if (owned.size < expected) {
              const top = Number(minted);
              const floor = Math.max(0, top - MAX_ID_SCAN);
              for (let hi = top; hi >= floor && owned.size < expected; hi -= SCAN_BATCH) {
                const ids = [];
                for (let id = hi; id > hi - SCAN_BATCH && id >= floor; id--) ids.push(id);
                const flags = await Promise.all(ids.map(isMine));
                ids.forEach((id, i) => flags[i] && owned.add(id));
              }
            }

            const checked = await Promise.all(
              [...owned].map(async (id) => {
                let used = false;
                try {
                  used = await nftContract.used(id);
                } catch {
                  /* el contrato podría no exponer used() */
                }
                const meta = await fetchTicketMetadata(nftContract, id);
                return { id, used, image: meta?.image || null, name: meta?.name || null };
              })
            );
            if (mySeq !== loadSeq.current) return;
            setTickets(checked.sort((a, b) => a.id - b.id));
          } catch (ticketErr) {
            console.warn('No se pudieron recuperar los tickets:', ticketErr);
          }

          // Sincronizar historial con mints reales y resolver pendientes
          await syncHistory(provider, nftContract, mySeq);
        } catch (nftErr) {
          console.warn('Error leyendo NFT:', nftErr);
          notify?.('error', 'No se pudo leer el contrato de entradas. Reintenta en unos segundos.');
        }
      } catch (err) {
        console.error('Error cargando datos de blockchain:', err);
        notify?.('error', 'No se pudieron cargar los datos de la blockchain.');
      } finally {
        if (mySeq === loadSeq.current) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, chainId, notify]
  );

  // Una fila por transacción real, con la fecha del bloque y el valor pagado
  async function syncHistory(provider, nftContract, mySeq) {
    try {
      const events = await queryLogs(nftContract, nftContract.filters.TicketsMinted(account));
      const recent = events.slice(-MAX_EVENTS_SYNCED);
      const records = await Promise.allSettled(
        recent.map(async (e) => {
          const [block, tx] = await Promise.all([e.getBlock(), e.getTransaction()]);
          const qty = Number(e.args[2]);
          return {
            hash: e.transactionHash,
            type: 'NFT_MINT',
            title: 'Minteo de Festival Ticket',
            description: `Adquisición de ${qty} entrada(s)`,
            amount: `${qty} Ticket(s)`,
            costEth: formatCost(tx.value, 1),
            timestamp: block.timestamp * 1000,
            status: 'success'
          };
        })
      );

      // Pagos en tokens hacia la wallet creadora
      const tokenContract = new ethers.Contract(CONTRACT_ADDRESSES.token, ERC20_ABI, provider);
      let payments = [];
      try {
        const [symbol, decimals, payEvents] = await Promise.all([
          tokenContract.symbol(),
          tokenContract.decimals(),
          queryLogs(tokenContract, tokenContract.filters.Transfer(account, OWNER_WALLET))
        ]);
        payments = await Promise.allSettled(
          payEvents.slice(-MAX_EVENTS_SYNCED).map(async (e) => {
            const block = await e.getBlock();
            return {
              hash: e.transactionHash,
              type: 'TOKEN_PAYMENT',
              title: `Pago en ${symbol}`,
              description: 'Transferencia a wallet creadora',
              amount: `${ethers.formatUnits(e.args[2], decimals)} ${symbol}`,
              costEth: '0 ETH',
              timestamp: block.timestamp * 1000,
              status: 'success'
            };
          })
        );
      } catch (payErr) {
        console.warn('No se pudieron leer los pagos en tokens:', payErr);
      }
      if (mySeq !== loadSeq.current) return;

      let next = [...txRef.current];
      for (const r of [...records, ...payments]) {
        if (r.status !== 'fulfilled') continue;
        const rec = r.value;
        const idx = next.findIndex((t) => t.hash.toLowerCase() === rec.hash.toLowerCase());
        if (idx === -1) next.push(rec);
        else next[idx] = { ...next[idx], status: 'success', timestamp: rec.timestamp };
      }

      // Pendientes huérfanos (p. ej. se recargó la página a mitad de la transacción)
      next = await Promise.all(
        next.map(async (t) => {
          if (t.status !== 'pending') return t;
          try {
            const receipt = await provider.getTransactionReceipt(t.hash);
            if (!receipt) return t;
            return { ...t, status: receipt.status === 1 ? 'success' : 'failed' };
          } catch {
            return t;
          }
        })
      );
      if (mySeq !== loadSeq.current) return;
      commitTxs(next.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    } catch (err) {
      console.warn('No se pudo sincronizar el historial:', err);
    }
  }

  useEffect(() => {
    if (onSepolia) loadData();
  }, [onSepolia, loadData]);

  // ---------- Precio y cantidad ----------
  const rerollPrice = useCallback(() => {
    if (BUSY_PHASES.includes(flowRef.current.phase) || flowRef.current.paid) return;
    setRandomPrice(rollTokenPrice(parseFloat(token.balance)));
  }, [token.balance]);

  const setQuantity = useCallback(
    (n) => setQuantityState(Math.max(1, Math.min(n, nft.maxPerTx))),
    [nft.maxPerTx]
  );
  const safeQuantity = Math.min(quantity, nft.maxPerTx);

  // ---------- Compra ----------
  const resetFlow = useCallback(() => setFlow(IDLE_FLOW), []);

  const buy = useCallback(async () => {
    if (!account || BUSY_PHASES.includes(flowRef.current.phase)) return;

    let stage = flowRef.current.paid ? 'mint' : 'pay';
    let currentHash = '';
    let paid = flowRef.current.paid;
    const qty = safeQuantity;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // --- PASO 1: pagar tokens ---
      if (!paid) {
        const bal = parseFloat(token.balance);
        if (bal <= 0) {
          setFlow({ ...IDLE_FLOW, phase: 'error', error: `Necesitas tokens ${token.symbol} para comprar.` });
          return;
        }
        if (randomPrice > bal) {
          setFlow({
            ...IDLE_FLOW,
            phase: 'error',
            error: `El precio (${randomPrice} ${token.symbol}) supera tu saldo disponible.`
          });
          return;
        }

        setFlow({
          ...IDLE_FLOW,
          phase: 'paying',
          message: `Paso 1 de 2: confirma en tu billetera el pago de ${randomPrice} ${token.symbol}.`
        });

        const tokenContract = new ethers.Contract(CONTRACT_ADDRESSES.token, ERC20_ABI, signer);
        const units = ethers.parseUnits(randomPrice.toString(), token.decimals);
        const transferTx = await tokenContract.transfer(OWNER_WALLET, units);
        currentHash = transferTx.hash;

        upsertTx({
          hash: transferTx.hash,
          type: 'TOKEN_PAYMENT',
          title: `Pago en ${token.symbol}`,
          description: 'Transferencia a wallet creadora',
          amount: `${randomPrice} ${token.symbol}`,
          costEth: '0 ETH',
          timestamp: Date.now(),
          status: 'pending'
        });

        setFlow({
          ...IDLE_FLOW,
          phase: 'confirmingPayment',
          txHash: transferTx.hash,
          message: `Esperando la confirmación del pago en ${token.symbol}…`
        });
        await transferTx.wait();
        setTxStatus(transferTx.hash, 'success');

        paid = { hash: transferTx.hash, amount: `${randomPrice} ${token.symbol}` };
        writeJson(paidKey(account), paid);
        currentHash = '';
      }

      // --- PASO 2: mintear ---
      stage = 'mint';
      setFlow({
        ...IDLE_FLOW,
        phase: 'minting',
        paid,
        message: `Paso 2 de 2: confirma en tu billetera el minteo de ${qty} entrada(s).`
      });

      const nftContract = new ethers.Contract(CONTRACT_ADDRESSES.nft, NFT_ABI, signer);
      const livePrice = (await callFirst(nftContract, ['price', 'PRICE'])) ?? nft.priceWei;
      const totalCostWei = BigInt(livePrice) * BigInt(qty);
      const mintTx = await nftContract.mint(qty, { value: totalCostWei });
      currentHash = mintTx.hash;

      upsertTx({
        hash: mintTx.hash,
        type: 'NFT_MINT',
        title: 'Minteo de Festival Ticket',
        description: `Adquisición de ${qty} entrada(s)`,
        amount: `${qty} Ticket(s)`,
        costEth: formatCost(livePrice, qty),
        timestamp: Date.now(),
        status: 'pending'
      });

      setFlow({
        ...IDLE_FLOW,
        phase: 'confirmingMint',
        paid,
        txHash: mintTx.hash,
        message: 'Confirmando tu entrada en Sepolia…'
      });
      await mintTx.wait();
      setTxStatus(mintTx.hash, 'success');
      writeJson(paidKey(account), null);

      setFlow({
        ...IDLE_FLOW,
        phase: 'success',
        txHash: mintTx.hash,
        message: `¡Listo! Compraste ${qty} entrada(s) (${paid.amount} + ${formatCost(livePrice, qty)}).`
      });
      notify?.('success', `¡Compraste ${qty} entrada(s) con éxito!`, { txHash: mintTx.hash });
      await loadData();
    } catch (err) {
      console.error('Error en el proceso de compra:', err);
      if (currentHash) setTxStatus(currentHash, 'failed');

      const message = friendlyError(err, {
        maxPerTx: nft.maxPerTx,
        priceText: formatCost(nft.priceWei, 1)
      });
      notify?.('error', message);

      if (stage === 'pay') {
        setFlow({ ...IDLE_FLOW, phase: 'error', error: message });
      } else {
        // Ya pagó: queda habilitado reintentar solo el mint
        setFlow({
          ...IDLE_FLOW,
          phase: 'awaitingMint',
          paid,
          error: message,
          message: 'Tu pago está confirmado. Reintenta el minteo cuando quieras.'
        });
      }
    }
  }, [account, token, randomPrice, safeQuantity, nft, notify, loadData, upsertTx, setTxStatus]);

  return {
    token,
    ethBalance,
    nft,
    tickets,
    randomPrice,
    quantity: safeQuantity,
    setQuantity,
    rerollPrice,
    isLoading,
    hasLoaded,
    transactions,
    clearHistory,
    flow,
    isBusy,
    buy,
    resetFlow,
    reload: loadData
  };
}
