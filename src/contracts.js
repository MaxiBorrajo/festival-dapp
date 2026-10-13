// Configuración de direcciones y contratos en Sepolia

// Sepolia Chain ID es 11155111 (0xaa36a7 en hex)
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX_CHAIN_ID = '0xaa36a7';

// Bloque de creación del contrato NFT: desde acá se leen los eventos del historial
export const DEPLOY_BLOCK = 11712675;

// Wallet creadora que recibe los tokens aleatorios
export const OWNER_WALLET = '0x14614a623c23Ab9A27F9f7dCB3C0C0C7814901Ca';

// Direcciones provistas
export const CONTRACT_ADDRESSES = {
  // Dirección de tu Token ERC-20
  token: '0x65bA3Ed0916F3232e8B9aB8a17b71e84a6C5297e',
  // Dirección de tu NFT (FestivalTicket)
  nft: '0xE7f397318797d95EB3ceBa5b3526Bf8Dd7d191Fe'
};

// Registro de tokens de pago y NFTs. Para sumar opciones basta con agregar entradas
// (NFT con mint(uint256) o buyTicket(), ver NFT_ABI). El primer token es el "base":
// el precio aleatorio se sortea en él y su factor de conversión es siempre 1.
// Son los de fábrica; el usuario puede sumar más desde la app (se guardan en localStorage).
export const DEFAULT_TOKENS = [
  { id: 'mpc', address: CONTRACT_ADDRESSES.token, fallbackSymbol: 'MPC' }
];

// single: contrato con buyTicket() (1 entrada por compra, sin totalMinted/maxPerTx)
export const DEFAULT_NFTS = [
  { id: 'festival', address: CONTRACT_ADDRESSES.nft, name: 'Festival Ticket' }
];

export const BASE_TOKEN_ID = DEFAULT_TOKENS[0].id;

// ABI estándar ERC-20
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// ABI del contrato FestivalTicket (UNQ-FEST)
export const NFT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function price() view returns (uint256)",
  "function PRICE() view returns (uint256)",
  "function MAX_PER_TX() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function festivalDate() view returns (uint64)",
  "function used(uint256 tokenId) view returns (bool)",
  "function mint(uint256 quantity) payable",
  "function checkIn(uint256 tokenId)",
  "function ticketPrice() view returns (uint256)",
  "function buyTicket() payable",
  "function isTicketUsed(uint256 tokenId) view returns (bool)",
  "event TicketMinted(address indexed buyer, uint256 indexed tokenId)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event TicketsMinted(address indexed buyer, uint256 firstTokenId, uint256 quantity)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "error IncorrectPayment()",
  "error FestivalDatePassed()",
  "error SoldOut()",
  "error MaxPerTxExceeded()"
];

