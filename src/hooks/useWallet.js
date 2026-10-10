import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { SEPOLIA_CHAIN_ID, SEPOLIA_HEX_CHAIN_ID } from '../contracts';

const DISCONNECTED_KEY = 'festival_manually_disconnected';

const readFlag = () => {
  try {
    return localStorage.getItem(DISCONNECTED_KEY) === '1';
  } catch {
    return false;
  }
};

const writeFlag = (value) => {
  try {
    if (value) localStorage.setItem(DISCONNECTED_KEY, '1');
    else localStorage.removeItem(DISCONNECTED_KEY);
  } catch {
    /* sin localStorage: se ignora */
  }
};

export function useWallet(notify) {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }]
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: SEPOLIA_HEX_CHAIN_ID,
              chainName: 'Sepolia Test Network',
              nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
              blockExplorerUrls: ['https://sepolia.etherscan.io']
            }]
          });
        } catch (addError) {
          console.error(addError);
          notify?.('error', 'No se pudo agregar la red Sepolia a tu billetera.');
        }
      } else if (switchError.code !== 4001) {
        notify?.('error', 'No se pudo cambiar a Sepolia. Cámbiala manualmente desde tu billetera.');
      }
    }
  }, [notify]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      notify?.('error', 'Instala MetaMask u otra billetera Web3 para usar esta dApp.');
      return;
    }
    try {
      setIsConnecting(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();
      writeFlag(false);
      setAccount(accounts[0] || '');
      setChainId(Number(network.chainId));
      if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
        await switchToSepolia();
      }
    } catch (err) {
      if (err?.code !== 4001 && err?.code !== 'ACTION_REJECTED') {
        console.error('Error al conectar:', err);
        notify?.('error', err.reason || err.message || 'Error al conectar la billetera.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [notify, switchToSepolia]);

  // Las billeteras no permiten "desconectar" desde la dApp: olvidamos la cuenta localmente.
  const disconnect = useCallback(() => {
    writeFlag(true);
    setAccount('');
  }, []);

  // Reconexión silenciosa al cargar la página
  useEffect(() => {
    if (!window.ethereum || readFlag()) return;
    let cancelled = false;
    (async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send('eth_accounts', []);
        if (cancelled || !accounts.length) return;
        const network = await provider.getNetwork();
        if (cancelled) return;
        setAccount(accounts[0]);
        setChainId(Number(network.chainId));
      } catch (err) {
        console.warn('No se pudo restaurar la sesión:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cambios de cuenta y de red (con limpieza al desmontar)
  useEffect(() => {
    if (!window.ethereum?.on) return;
    const onAccounts = (accounts) => {
      if (accounts[0]) writeFlag(false);
      setAccount(accounts[0] || '');
    };
    const onChain = (hex) => setChainId(parseInt(hex, 16));
    window.ethereum.on('accountsChanged', onAccounts);
    window.ethereum.on('chainChanged', onChain);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccounts);
      window.ethereum.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const isWrongNetwork = !!account && chainId !== null && chainId !== SEPOLIA_CHAIN_ID;

  return { account, chainId, isConnecting, isWrongNetwork, connect, disconnect, switchToSepolia };
}
