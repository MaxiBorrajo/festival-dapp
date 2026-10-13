import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import {
  BASE_TOKEN_ID,
  OWNER_WALLET,
  ERC20_ABI,
  NFT_ABI,
  SEPOLIA_CHAIN_ID,
  DEPLOY_BLOCK
} from '../contracts';
import { loadRegistry, saveRegistry, mergeTokens, mergeNfts, probeToken, probeNft } from '../lib/registry';
import { formatCost, rollTokenPrice, rollConversionFactor, formatAmount, friendlyError } from '../lib/format';

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
// `details` acumula lo que muestra el modal: snapshot de la compra, hashes, fees reales y tokenIds
const IDLE_FLOW = { phase: 'idle', message: '', error: '', txHash: '', paid: null, details: null };

// Primer nombre de función que responda (p. ej. price() o PRICE())
const callFirstWith = async (contract, names, ...args) => {
  for (const name of names) {
    try {
      return await contract[name](...args);
    } catch {
      /* probar el siguiente */
    }
  }
  return null;
};

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

// Logs desde el bloque de creación hasta el último, en tramos que respetan el límite
// de rango de los RPC (MetaMask/Infura: 10 000 bloques). Si un tramo igual falla,
// se divide a la mitad.
const LOG_CHUNK = 9000;
const LOG_CONCURRENCY = 6;

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

  const ranges = [];
  for (let from = fromBlock; from <= latest; from += LOG_CHUNK) {
    ranges.push([from, Math.min(from + LOG_CHUNK - 1, latest)]);
  }

  // Cola con concurrencia limitada para no saturar el RPC
  const results = new Array(ranges.length);
  let next = 0;
  const worker = async () => {
    while (next < ranges.length) {
      const i = next++;
      results[i] = await queryLogsRange(contract, filter, ranges[i][0], ranges[i][1]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOG_CONCURRENCY, ranges.length) }, worker));

  return results.flat();
};

// IDs en posesión: candidatos por Transfer confirmados con ownerOf y, si el RPC no
// devolvió todos, escaneo de IDs recientes.
async function scanOwnedTickets(nftContract, account, expected, getTop) {
  const isMine = async (id) => {
    try {
      const owner = await nftContract.ownerOf(id);
      return owner.toLowerCase() === account.toLowerCase();
    } catch {
      return false;
    }
  };

  const owned = new Set();
  try {
    const incoming = await queryLogs(nftContract, nftContract.filters.Transfer(null, account));
    const candidates = [...new Set(incoming.map((e) => Number(e.args[2])))].slice(-MAX_TICKETS_SCANNED);
    const flags = await Promise.all(candidates.map(isMine));
    candidates.forEach((id, i) => flags[i] && owned.add(id));
  } catch (logErr) {
    console.warn('No se pudieron leer los logs de Transfer:', logErr);
  }

  if (owned.size < expected) {
    const top = await getTop();
    const floor = Math.max(0, top - MAX_ID_SCAN);
    for (let hi = top; hi >= floor && owned.size < expected; hi -= SCAN_BATCH) {
      const ids = [];
      for (let id = hi; id > hi - SCAN_BATCH && id >= floor; id--) ids.push(id);
      const flags = await Promise.all(ids.map(isMine));
      ids.forEach((id, i) => flags[i] && owned.add(id));
    }
  }
  return owned;
}

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
  const [tokensInfo, setTokensInfo] = useState({}); // { [tokenId]: { symbol, decimals, balance } }
  const [custom, setCustom] = useState(loadRegistry); // { tokens, nfts } agregados por el usuario
  const TOKENS = mergeTokens(custom.tokens);
  const NFTS = mergeNfts(custom.nfts);
  const registryKey = `${TOKENS.map((t) => t.address).join()}|${NFTS.map((n) => n.address).join()}`;
  const [selectedTokenId, setSelectedTokenId] = useState(BASE_TOKEN_ID);
  const [selectedNftId, setSelectedNftId] = useState(NFTS[0].id);
  const [factors, setFactors] = useState({ [BASE_TOKEN_ID]: 1 });
  const [needsRoll, setNeedsRoll] = useState(false);
  const [ethBalance, setEthBalance] = useState('0');
  const [nft, setNft] = useState({
    totalMinted: 0,
    maxSupply: 10000,
    priceWei: 1n,
    maxPerTx: DEFAULT_MAX_PER_TX,
    festivalDate: null,
    balance: 0
  });
  const [tickets, setTickets] = useState([]); // [{ key, id, used, nftId, nftName, nftAddress }]
  const [nftBalances, setNftBalances] = useState({});
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

  const tokenCfg = TOKENS.find((t) => t.id === selectedTokenId) || TOKENS[0];
  const nftCfg = NFTS.find((n) => n.id === selectedNftId) || NFTS[0];
  const info = tokensInfo[tokenCfg.id] || { symbol: tokenCfg.fallbackSymbol, decimals: 18, balance: '0' };
  const token = { ...info, id: tokenCfg.id, address: tokenCfg.address, isBase: tokenCfg.id === BASE_TOKEN_ID };
  const factor = token.isBase ? 1 : factors[tokenCfg.id] ?? 1;
  const tokenCfgRef = useRef(tokenCfg);
  tokenCfgRef.current = tokenCfg;

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
    setNftBalances({});
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
    if (paid?.tokenId) setSelectedTokenId(paid.tokenId);
    if (paid?.nftId) setSelectedNftId(paid.nftId);
    setFlow(
      paid
        ? {
            ...IDLE_FLOW,
            phase: 'awaitingMint',
            paid,
            details: paid.details ?? null,
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

        // Tokens ERC-20 del registro
        const results = await Promise.allSettled(
          TOKENS.map(async (t) => {
            const c = new ethers.Contract(t.address, ERC20_ABI, provider);
            const [symbol, decimals, bal] = await Promise.all([
              c.symbol(),
              c.decimals(),
              c.balanceOf(account)
            ]);
            return [t.id, { symbol, decimals: Number(decimals), balance: ethers.formatUnits(bal, decimals) }];
          })
        );
        if (mySeq !== loadSeq.current) return;
        const loaded = {};
        results.forEach((r) => {
          if (r.status === 'fulfilled') loaded[r.value[0]] = r.value[1];
          else console.warn('Error leyendo token ERC-20:', r.reason);
        });
        if (Object.keys(loaded).length < TOKENS.length) {
          notify?.('error', 'No se pudo leer el saldo del token. Revisa tu conexión y reintenta.');
        }
        setTokensInfo((prev) => ({ ...prev, ...loaded }));
        if (reroll) setNeedsRoll(true);

        // NFT
        const nftContract = new ethers.Contract(nftCfg.address, NFT_ABI, provider);
        try {
          const [minted, max, price, maxPerTx, festivalDate, myNfts] = await Promise.all([
            nftCfg.single
              ? queryLogs(nftContract, nftContract.filters.TicketMinted()).then((l) => l.length)
              : nftContract.totalMinted(),
            callFirst(nftContract, ['maxSupply', 'MAX_SUPPLY']),
            callFirst(nftContract, ['price', 'PRICE', 'ticketPrice']),
            nftCfg.single ? Promise.resolve(1) : callFirst(nftContract, ['MAX_PER_TX']),
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

          // Tickets en posesión de todos los NFT del registro
          try {
            const perNft = await Promise.all(
              NFTS.map(async (cfg) => {
                const c = cfg.address === nftCfg.address ? nftContract : new ethers.Contract(cfg.address, NFT_ABI, provider);
                const expected =
                  cfg.address === nftCfg.address ? Number(myNfts) : Number(await c.balanceOf(account));
                if (expected === 0) return { cfg, expected, list: [] };
                const getTop = async () =>
                  cfg.address === nftCfg.address
                    ? Number(minted)
                    : cfg.single
                      ? (await queryLogs(c, c.filters.TicketMinted())).length
                      : Number(await c.totalMinted());
                const festivalDateOf = cfg.address === nftCfg.address
                  ? (festivalDate !== null ? Number(festivalDate) : null)
                  : await callFirst(c, ['festivalDate']).then((v) => (v !== null ? Number(v) : null));
                const owned = await scanOwnedTickets(c, account, expected, getTop);
                const list = await Promise.all(
                  [...owned].map(async (id) => {
                    const used = !!(await callFirstWith(c, ['used', 'isTicketUsed'], id));
                    const meta = await fetchTicketMetadata(c, id);
                    return {
                      key: `${cfg.id}:${id}`,
                      id,
                      used,
                      image: meta?.image || null,
                      name: meta?.name || null,
                      nftId: cfg.id,
                      nftName: cfg.name,
                      nftAddress: cfg.address,
                      festivalDate: festivalDateOf
                    };
                  })
                );
                return { cfg, expected, list };
              })
            );
            if (mySeq !== loadSeq.current) return;
            setTickets(perNft.flatMap((r) => r.list).sort((x, y) => x.nftId.localeCompare(y.nftId) || x.id - y.id));
            setNftBalances(Object.fromEntries(perNft.map((r) => [r.cfg.id, r.expected])));
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
    [account, chainId, notify, nftCfg.address, nftCfg.single, registryKey]
  );

  // Una fila por transacción real, con la fecha del bloque y el valor pagado
  async function syncHistory(provider, nftContract, mySeq) {
    try {
      const events = await queryLogs(
        nftContract,
        nftCfg.single
          ? nftContract.filters.TicketMinted(account)
          : nftContract.filters.TicketsMinted(account)
      );
      const recent = events.slice(-MAX_EVENTS_SYNCED);
      const records = await Promise.allSettled(
        recent.map(async (e) => {
          const [block, tx] = await Promise.all([e.getBlock(), e.getTransaction()]);
          const qty = nftCfg.single ? 1 : Number(e.args[2]);
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

      // Pagos en tokens (de todos los del registro) hacia la wallet creadora
      let payments = [];
      for (const t of TOKENS) {
        try {
          const tokenContract = new ethers.Contract(t.address, ERC20_ABI, provider);
          const [symbol, decimals, payEvents] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.decimals(),
            queryLogs(tokenContract, tokenContract.filters.Transfer(account, OWNER_WALLET))
          ]);
          const part = await Promise.allSettled(
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
          payments = payments.concat(part);
        } catch (payErr) {
          console.warn('No se pudieron leer los pagos en tokens:', payErr);
        }
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

  // ---------- Precio, factor y cantidad ----------
  // El precio base se sortea en el token base; para otros tokens se sortea además un
  // factor 0–10 y el monto a pagar es base × factor.
  // ---------- Registro de tokens / NFTs agregados a mano ----------
  const commitCustom = useCallback((next) => {
    setCustom(next);
    saveRegistry(next);
  }, []);

  const addToken = useCallback(
    async (address) => {
      if (!account || !window.ethereum) throw new Error('Conecta tu billetera primero.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const cfg = await probeToken(provider, address.trim(), account, TOKENS);
      commitCustom({ ...custom, tokens: [...custom.tokens, cfg] });
      return cfg;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, custom, registryKey, commitCustom]
  );

  const addNft = useCallback(
    async (address) => {
      if (!window.ethereum) throw new Error('Conecta tu billetera primero.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const cfg = await probeNft(provider, address.trim(), NFTS);
      commitCustom({ ...custom, nfts: [...custom.nfts, cfg] });
      return cfg;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [custom, registryKey, commitCustom]
  );

  const removeToken = useCallback(
    (id) => {
      commitCustom({ ...custom, tokens: custom.tokens.filter((t) => t.id !== id) });
      setSelectedTokenId((cur) => (cur === id ? BASE_TOKEN_ID : cur));
    },
    [custom, commitCustom]
  );

  const removeNft = useCallback(
    (id) => {
      commitCustom({ ...custom, nfts: custom.nfts.filter((n) => n.id !== id) });
      setSelectedNftId((cur) => (cur === id ? NFTS[0].id : cur));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [custom, commitCustom, registryKey]
  );

  const rollRound = useCallback((tokenId, tokenInfo) => {
    const f = tokenId === BASE_TOKEN_ID ? 1 : rollConversionFactor();
    setFactors((prev) => ({ ...prev, [tokenId]: f }));
    setRandomPrice(rollTokenPrice(parseFloat(tokenInfo?.balance) / f));
  }, []);

  useEffect(() => {
    if (!needsRoll || !tokensInfo[tokenCfg.id]) return;
    setNeedsRoll(false);
    rollRound(tokenCfg.id, tokensInfo[tokenCfg.id]);
  }, [needsRoll, tokensInfo, tokenCfg.id, rollRound]);

  const rerollPrice = useCallback(() => {
    if (BUSY_PHASES.includes(flowRef.current.phase) || flowRef.current.paid) return;
    rollRound(tokenCfgRef.current.id, tokensInfo[tokenCfgRef.current.id]);
  }, [tokensInfo, rollRound]);

  const selectToken = useCallback((id) => {
    if (BUSY_PHASES.includes(flowRef.current.phase) || flowRef.current.paid) return;
    setSelectedTokenId(id);
    setNeedsRoll(true);
  }, []);

  const selectNft = useCallback((id) => {
    if (BUSY_PHASES.includes(flowRef.current.phase) || flowRef.current.paid) return;
    setSelectedNftId(id);
  }, []);

  // Monto final a pagar en el token elegido (4 decimales, nunca por encima del saldo)
  const payAmount = (() => {
    const bal = parseFloat(token.balance) || 0;
    const raw = parseFloat((randomPrice * factor).toFixed(4));
    return Math.min(Math.max(raw, raw > 0 ? 0.0001 : 0), Math.floor(bal * 10000) / 10000);
  })();

  const setQuantity = useCallback(
    (n) => setQuantityState(Math.max(1, Math.min(n, nft.maxPerTx))),
    [nft.maxPerTx]
  );
  const safeQuantity = Math.min(quantity, nft.maxPerTx);

  // ---------- Compra ----------
  const resetFlow = useCallback(() => setFlow(IDLE_FLOW), []);

  // Fees estimados (gas × precio de gas actual) de las dos transacciones, para el modal
  const estimateFees = useCallback(async () => {
    if (!account || !window.ethereum) return null;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!gasPrice) return null;
      const out = { gasPrice, payFeeWei: null, mintFeeWei: null };
      try {
        const tokenContract = new ethers.Contract(tokenCfg.address, ERC20_ABI, provider);
        const units = ethers.parseUnits(formatAmount(payAmount, token.decimals), token.decimals);
        const gas = await tokenContract.transfer.estimateGas(OWNER_WALLET, units, { from: account });
        out.payFeeWei = gas * gasPrice;
      } catch {
        /* sin estimación */
      }
      try {
        const nftContract = new ethers.Contract(nftCfg.address, NFT_ABI, provider);
        const value = nft.priceWei * BigInt(safeQuantity);
        const gas = nftCfg.single
          ? await nftContract.buyTicket.estimateGas({ from: account, value })
          : await nftContract.mint.estimateGas(safeQuantity, { from: account, value });
        out.mintFeeWei = gas * gasPrice;
      } catch {
        /* sin estimación */
      }
      return out;
    } catch {
      return null;
    }
  }, [account, tokenCfg.address, nftCfg.address, payAmount, token.decimals, safeQuantity, nft.priceWei]);

  const buy = useCallback(async () => {
    if (!account || BUSY_PHASES.includes(flowRef.current.phase)) return;

    let stage = flowRef.current.paid ? 'mint' : 'pay';
    let currentHash = '';
    let paid = flowRef.current.paid;

    // Si es un reintento, se usa lo que quedó guardado con el pago
    const useToken = TOKENS.find((t) => t.id === paid?.tokenId) || tokenCfg;
    const useNft = NFTS.find((n) => n.id === paid?.nftId) || nftCfg;
    const qty = paid?.qty ?? safeQuantity;
    const snapshot = paid
      ? { ...paid.snapshot }
      : {
          tokenSymbol: token.symbol,
          tokenAddress: tokenCfg.address,
          nftName: nftCfg.name,
          nftAddress: nftCfg.address,
          qty,
          basePrice: randomPrice,
          factor,
          isBase: token.isBase,
          payAmount,
          mintCostWei: (nft.priceWei * BigInt(qty)).toString()
        };
    let details = { ...(paid?.details || {}), snapshot };
    const push = (patch) => {
      details = { ...details, ...patch };
      return details;
    };

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
        if (payAmount <= 0 || payAmount > bal) {
          setFlow({
            ...IDLE_FLOW,
            phase: 'error',
            error: `El precio (${formatAmount(payAmount)} ${token.symbol}) supera tu saldo disponible.`
          });
          return;
        }

        const amountText = `${formatAmount(payAmount)} ${token.symbol}`;
        setFlow({
          ...IDLE_FLOW,
          phase: 'paying',
          details: push({}),
          message: `Paso 1 de 2: confirma en tu billetera el pago de ${amountText}.`
        });

        const tokenContract = new ethers.Contract(useToken.address, ERC20_ABI, signer);
        const units = ethers.parseUnits(formatAmount(payAmount, token.decimals), token.decimals);
        const transferTx = await tokenContract.transfer(OWNER_WALLET, units);
        currentHash = transferTx.hash;

        upsertTx({
          hash: transferTx.hash,
          type: 'TOKEN_PAYMENT',
          title: `Pago en ${token.symbol}`,
          description: 'Transferencia a wallet creadora',
          amount: amountText,
          costEth: '0 ETH',
          timestamp: Date.now(),
          status: 'pending'
        });

        setFlow({
          ...IDLE_FLOW,
          phase: 'confirmingPayment',
          txHash: transferTx.hash,
          details: push({ payHash: transferTx.hash }),
          message: `Esperando la confirmación del pago en ${token.symbol}…`
        });
        const payReceipt = await transferTx.wait();
        setTxStatus(transferTx.hash, 'success');
        push({ payFeeWei: (payReceipt.gasUsed * payReceipt.gasPrice).toString() });

        paid = {
          hash: transferTx.hash,
          amount: amountText,
          tokenId: tokenCfg.id,
          nftId: nftCfg.id,
          qty,
          symbol: token.symbol,
          snapshot,
          details
        };
        writeJson(paidKey(account), paid);
        currentHash = '';
      }

      // --- PASO 2: mintear ---
      stage = 'mint';
      setFlow({
        ...IDLE_FLOW,
        phase: 'minting',
        paid,
        details: push({}),
        message: `Paso 2 de 2: confirma en tu billetera el minteo de ${qty} entrada(s).`
      });

      const nftContract = new ethers.Contract(useNft.address, NFT_ABI, signer);
      const livePrice = (await callFirst(nftContract, ['price', 'PRICE', 'ticketPrice'])) ?? nft.priceWei;
      const totalCostWei = BigInt(livePrice) * BigInt(qty);
      const mintTx = useNft.single
        ? await nftContract.buyTicket({ value: totalCostWei })
        : await nftContract.mint(qty, { value: totalCostWei });
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
        details: push({ mintHash: mintTx.hash, mintCostWei: totalCostWei.toString() }),
        message: 'Confirmando tu entrada en Sepolia…'
      });
      const mintReceipt = await mintTx.wait();
      setTxStatus(mintTx.hash, 'success');
      writeJson(paidKey(account), null);

      // Token IDs minteados, desde el evento TicketsMinted
      let tokenIds = [];
      try {
        for (const log of mintReceipt.logs) {
          if (log.address.toLowerCase() !== useNft.address.toLowerCase()) continue;
          const parsed = nftContract.interface.parseLog(log);
          if (parsed?.name === 'TicketMinted') {
            tokenIds.push(Number(parsed.args[1]));
          } else if (parsed?.name === 'TicketsMinted') {
            const first = Number(parsed.args[1]);
            tokenIds = Array.from({ length: Number(parsed.args[2]) }, (_, i) => first + i);
          }
        }
      } catch {
        /* sin IDs */
      }
      push({
        mintFeeWei: (mintReceipt.gasUsed * mintReceipt.gasPrice).toString(),
        tokenIds
      });

      setFlow({
        ...IDLE_FLOW,
        phase: 'success',
        txHash: mintTx.hash,
        details,
        message: `¡Listo! Compraste ${qty} entrada(s) (${paid.amount} + ${formatCost(livePrice, qty)}).`
      });
      notify?.('success', `¡Compraste ${qty} entrada(s) con éxito!`, { txHash: mintTx.hash });
      await loadData({ reroll: false });
      setNeedsRoll(true);
    } catch (err) {
      console.error('Error en el proceso de compra:', err);
      if (currentHash) setTxStatus(currentHash, 'failed');

      const message = friendlyError(err, {
        maxPerTx: nft.maxPerTx,
        priceText: formatCost(nft.priceWei, 1)
      });
      notify?.('error', message);

      if (stage === 'pay') {
        setFlow({ ...IDLE_FLOW, phase: 'error', error: message, details });
      } else {
        // Ya pagó: queda habilitado reintentar solo el mint
        setFlow({
          ...IDLE_FLOW,
          phase: 'awaitingMint',
          paid,
          details,
          error: message,
          message: 'Tu pago está confirmado. Reintenta el minteo cuando quieras.'
        });
      }
    }
  }, [
    account,
    token,
    tokenCfg,
    nftCfg,
    randomPrice,
    factor,
    payAmount,
    safeQuantity,
    nft,
    notify,
    loadData,
    upsertTx,
    setTxStatus
  ]);

  return {
    token,
    tokens: TOKENS.map((t) => ({
      id: t.id,
      address: t.address,
      isBase: t.id === BASE_TOKEN_ID,
      ...(tokensInfo[t.id] || { symbol: t.fallbackSymbol, decimals: 18, balance: '0' })
    })),
    selectToken,
    nfts: NFTS,
    customIds: { tokens: custom.tokens.map((t) => t.id), nfts: custom.nfts.map((n) => n.id) },
    addToken,
    addNft,
    removeToken,
    removeNft,
    selectedNftId,
    selectNft,
    factor,
    payAmount,
    estimateFees,
    ethBalance,
    nft,
    tickets,
    nftBalances,
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
