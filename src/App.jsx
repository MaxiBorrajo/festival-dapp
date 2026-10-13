import React, { useState } from 'react';
import { SEPOLIA_CHAIN_ID, OWNER_WALLET } from './contracts';
import { EXPLORER, shortAddr } from './lib/format';
import { useToasts } from './hooks/useToasts';
import { useWallet } from './hooks/useWallet';
import { useFestival } from './hooks/useFestival';
import Header from './components/Header';
import NetworkBanner from './components/NetworkBanner';
import TabNav from './components/TabNav';
import EventCard from './components/EventCard';
import BuyWizard from './components/BuyWizard';
import TicketsTab from './components/TicketsTab';
import HistoryTab from './components/HistoryTab';
import Toasts from './components/Toasts';

export default function App() {
  const [tab, setTab] = useState('buy'); // 'buy' | 'tickets' | 'history'

  const { toasts, notify, dismiss } = useToasts();
  const wallet = useWallet(notify);
  const fest = useFestival({ account: wallet.account, chainId: wallet.chainId, notify });

  const [headerTokenId, setHeaderTokenId] = useState(fest.tokens[0].id);

  const reload = () => fest.reload();
  const totalTickets = Object.values(fest.nftBalances).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen flex flex-col selection:bg-accent selection:text-accent-fg">
      <Toasts toasts={toasts} onDismiss={dismiss} />

      <Header
        account={wallet.account}
        tokenSymbol={fest.token.symbol}
        tokens={fest.tokens}
        headerTokenId={fest.tokens.some((t) => t.id === headerTokenId) ? headerTokenId : fest.tokens[0].id}
        onHeaderTokenChange={setHeaderTokenId}
        ethBalance={fest.ethBalance}
        isConnecting={wallet.isConnecting}
        hasLoaded={fest.hasLoaded}
        pending={fest.isBusy}
        onPendingClick={() => setTab('buy')}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
      />

      {wallet.isWrongNetwork && <NetworkBanner onSwitch={wallet.switchToSepolia} />}

      <TabNav
        active={tab}
        onChange={setTab}
        counts={{ buy: 0, tickets: totalTickets, history: fest.transactions.length }}
      />

      {/* pb-28: deja espacio para la barra inferior fija en móvil */}
      <main className="max-w-6xl mx-auto w-full px-4 mt-6 pb-28 md:pb-10 flex-1">
        {tab === 'buy' && (
          <div
            id="panel-buy"
            role="tabpanel"
            aria-labelledby="tab-buy"
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <div className="lg:col-span-5">
              <EventCard nft={fest.nft} hasLoaded={fest.hasLoaded || !wallet.account} />
            </div>
            <div className="lg:col-span-7">
              <BuyWizard
                account={wallet.account}
                isWrongNetwork={wallet.isWrongNetwork}
                onConnect={wallet.connect}
                token={fest.token}
                tokens={fest.tokens}
                registry={{
                  customIds: fest.customIds,
                  addToken: fest.addToken,
                  addNft: fest.addNft,
                  removeToken: fest.removeToken,
                  removeNft: fest.removeNft
                }}
                selectToken={fest.selectToken}
                nfts={fest.nfts}
                selectedNftId={fest.selectedNftId}
                selectNft={fest.selectNft}
                factor={fest.factor}
                payAmount={fest.payAmount}
                estimateFees={fest.estimateFees}
                nft={fest.nft}
                randomPrice={fest.randomPrice}
                quantity={fest.quantity}
                setQuantity={fest.setQuantity}
                rerollPrice={fest.rerollPrice}
                flow={fest.flow}
                isBusy={fest.isBusy}
                buy={fest.buy}
                resetFlow={fest.resetFlow}
                onGoTickets={() => setTab('tickets')}
              />
            </div>
          </div>
        )}

        {tab === 'tickets' && (
          <div id="panel-tickets" role="tabpanel" aria-labelledby="tab-tickets">
            <TicketsTab
              account={wallet.account}
              tickets={fest.tickets}
              nfts={fest.nfts}
              nftBalances={fest.nftBalances}
              tokenSymbol={fest.token.symbol}
              isLoading={fest.isLoading}
              onReload={reload}
              onGoBuy={() => setTab('buy')}
            />
          </div>
        )}

        {tab === 'history' && (
          <div id="panel-history" role="tabpanel" aria-labelledby="tab-history">
            <HistoryTab
              transactions={fest.transactions}
              tokenSymbol={fest.token.symbol}
              isLoading={fest.isLoading}
              onSync={reload}
              onClear={fest.clearHistory}
              onGoBuy={() => setTab('buy')}
            />
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto w-full px-4 pt-6 pb-24 md:pb-6 border-t border-line text-sm text-muted flex flex-col sm:flex-row items-center justify-between gap-3">
        <span>Red Sepolia (Chain ID {SEPOLIA_CHAIN_ID})</span>
        <span>
          Wallet creadora:{' '}
          <a
            href={`${EXPLORER}/address/${OWNER_WALLET}`}
            target="_blank"
            rel="noreferrer"
            className="text-fg underline font-mono"
          >
            {shortAddr(OWNER_WALLET)}
          </a>
        </span>
        <span>UNQ Festival dApp</span>
      </footer>
    </div>
  );
}
