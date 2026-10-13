import { ethers } from 'ethers';
import { DEFAULT_TOKENS, DEFAULT_NFTS, ERC20_ABI, NFT_ABI } from '../contracts';

const KEY = 'festival_registry_v1';

const sel = (sig) => ethers.id(sig).slice(2, 10);
const SEL = {
  mint: sel('mint(uint256)'),
  buyTicket: sel('buyTicket()'),
  ownerOf: sel('ownerOf(uint256)')
};

export function loadRegistry() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return {
      tokens: Array.isArray(raw?.tokens) ? raw.tokens.filter((t) => ethers.isAddress(t.address)) : [],
      nfts: Array.isArray(raw?.nfts) ? raw.nfts.filter((n) => ethers.isAddress(n.address)) : []
    };
  } catch {
    return { tokens: [], nfts: [] };
  }
}

export function saveRegistry(custom) {
  try {
    localStorage.setItem(KEY, JSON.stringify(custom));
  } catch (e) {
    console.warn('No se pudo guardar el registro:', e);
  }
}

export const mergeTokens = (custom) => [...DEFAULT_TOKENS, ...custom];
export const mergeNfts = (custom) => [...DEFAULT_NFTS, ...custom];

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

export async function probeToken(provider, rawAddress, account, existing) {
  if (!ethers.isAddress(rawAddress)) throw new Error('La dirección no es válida.');
  const address = ethers.getAddress(rawAddress);
  if (existing.some((t) => same(t.address, address))) throw new Error('Ese token ya está agregado.');
  const code = await provider.getCode(address);
  if (code === '0x') throw new Error('No hay ningún contrato en esa dirección (¿red Sepolia?).');
  try {
    const c = new ethers.Contract(address, ERC20_ABI, provider);
    const [symbol] = await Promise.all([c.symbol(), c.decimals(), c.balanceOf(account)]);
    return { id: `tok-${address.slice(2, 10).toLowerCase()}`, address, fallbackSymbol: symbol, custom: true };
  } catch {
    throw new Error('El contrato no parece un token ERC-20 (falló symbol/decimals/balanceOf).');
  }
}

export async function probeNft(provider, rawAddress, existing) {
  if (!ethers.isAddress(rawAddress)) throw new Error('La dirección no es válida.');
  const address = ethers.getAddress(rawAddress);
  if (existing.some((n) => same(n.address, address))) throw new Error('Ese NFT ya está agregado.');
  const code = await provider.getCode(address);
  if (code === '0x') throw new Error('No hay ningún contrato en esa dirección (¿red Sepolia?).');
  const has = (s) => code.includes(s);
  if (!has(SEL.ownerOf)) throw new Error('El contrato no parece un NFT (ERC-721).');
  let single;
  if (has(SEL.buyTicket)) single = true;
  else if (has(SEL.mint)) single = false;
  else throw new Error('El NFT no tiene una función de compra compatible (mint(uint256) o buyTicket()).');
  let name = 'NFT';
  try {
    name = await new ethers.Contract(address, NFT_ABI, provider).name();
  } catch {
    /* sin nombre */
  }
  return {
    id: `nft-${address.slice(2, 10).toLowerCase()}`,
    address,
    name,
    ...(single ? { single: true } : {}),
    custom: true
  };
}
