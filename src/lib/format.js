import { ethers } from 'ethers';

export const EXPLORER = 'https://sepolia.etherscan.io';

export const shortAddr = (addr = '') => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '');

export const shortHash = (hash = '') => (hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : '');

// Costo en wei (total = precio * cantidad) en texto legible
export const formatCost = (weiAmount, qty = 1) => {
  try {
    const totalWei = BigInt(weiAmount ?? 1n) * BigInt(qty);
    if (totalWei === 0n) return 'Gratis';
    if (totalWei < 10000000000n) return `${totalWei.toString()} wei`;
    return `${ethers.formatEther(totalWei)} SepoliaETH`;
  } catch {
    return '1 wei';
  }
};

// festivalDate del contrato viene en segundos unix (uint64)
export const formatFestivalDate = (unixSeconds) => {
  const n = Number(unixSeconds);
  if (!n) return null;
  return new Date(n * 1000).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

// Precio aleatorio en tokens: tope 1000, o el saldo si es menor, para que siempre alcance.
export const rollTokenPrice = (userBal) => {
  if (!userBal || userBal <= 0) return 0;
  if (userBal > 1000) return Math.floor(Math.random() * 1000) + 1;
  if (userBal >= 1) return Math.floor(Math.random() * Math.floor(userBal)) + 1;
  const factor = 0.1 + Math.random() * 0.8;
  return Math.max(parseFloat((userBal * factor).toFixed(4)), 0.0001);
};

export const friendlyError = (err, { maxPerTx = 4, priceText = '' } = {}) => {
  const text = `${err?.data ?? ''} ${err?.message ?? ''} ${err?.reason ?? ''}`;
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) return 'Operación cancelada en tu billetera.';
  if (text.includes('0x569e8c11') || text.includes('IncorrectPayment')) {
    return `El contrato rechazó el pago (IncorrectPayment). El costo exacto por ticket es ${priceText || 'el precio base'}.`;
  }
  if (text.includes('0xf43a22dc') || text.includes('MaxPerTxExceeded')) {
    return `Superaste el límite de tickets por transacción (máximo ${maxPerTx}).`;
  }
  if (text.includes('SoldOut')) return 'Las entradas están agotadas.';
  if (text.includes('FestivalDatePassed')) return 'El festival ya pasó: no se pueden mintear más entradas.';
  if (text.toLowerCase().includes('insufficient funds')) return 'No tienes suficiente SepoliaETH para costo + gas.';
  return err?.reason || err?.shortMessage || err?.message || 'Error en la transacción.';
};
