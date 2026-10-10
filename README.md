# Festival Ticket NFT dApp 🎟️

dApp sencilla en React + Vite para mintear entradas de festival (NFT ERC-721) con condición de acceso (gatekeeping) mediante un token personalizado (ERC-20).

## 🚀 Requisitos y Flujo
1. **Red:** Ethereum Sepolia (`Chain ID 11155111`).
2. **Requisito de acceso:** La dApp lee el balance del usuario del token `0x65bA3Ed0916F3232e8B9aB8a17b71e84a6C5297e`. Si no posee tokens, la compra permanece bloqueada.
3. **Precio Dinámico / Aleatorio:** Calcula un valor aleatorio entre 1 y 1000 tokens si el saldo es mayor a 1000, o con tope en su saldo disponible para garantizar que siempre le alcance.
4. **Compra en 2 pasos:**
   - **Paso 1:** Transfiere la cantidad aleatoria de tokens a la wallet del creador (`0x14614a623c23Ab9A27F9f7dCB3C0C0C7814901Ca`).
   - **Paso 2:** Ejecuta el minteo `mint(quantity)` en el contrato `FestivalTicket` (`0xE7f397318797d95EB3ceBa5b3526Bf8Dd7d191Fe`) pagando el costo exacto del contrato (`price() * cantidad`, configurado en 1 wei por ticket en Sepolia).

---

## 🛠️ Instalación y Ejecución

Entra a la carpeta del proyecto:
```bash
cd festival-dapp
```

Instala las dependencias:
```bash
npm install
```

Inicia el servidor de desarrollo:
```bash
npm run dev
```

Abre tu navegador en `http://localhost:3000` (o la URL que indique la consola).

