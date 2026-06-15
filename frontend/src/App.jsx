import React, { useState } from 'react';
import MissionControl from './pages/MissionControl.jsx';
import CustomerExplorer from './pages/Customers.jsx';
import Customer360 from './pages/Customer360.jsx';
import CampaignsPage from './pages/Campaigns.jsx';
import { Coffee, Layers, Users, Rocket } from 'lucide-react';
import TemplatesPage from './pages/Templates.jsx';
import ThemeProvider from './theme/ThemeProvider';
import ThemeToggle from './theme/ThemeToggle';

function App() {
  // 'mission-control' | 'customers' | 'campaigns'
  const [currentPage, setCurrentPage] = useState('campaigns');
  // When a campaign row is clicked, store its ID and navigate to Mission Control
  const [activeCampaignId, setActiveCampaignId] = useState(null);

  const handleOpenMissionControl = (campaignId) => {
    setActiveCampaignId(campaignId);
    setCurrentPage('mission-control');
  };

  const navItems = [
    { key: 'mission-control', label: 'Mission Control', icon: Layers },
    { key: 'campaigns',       label: 'Campaigns',       icon: Rocket },
    { key: 'customers',       label: 'Customer Explorer', icon: Users },
    { key: 'templates',       label: 'Templates',        icon: Layers },
  ];

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* ── Sticky Navigation Bar ──────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-zinc-950/80 border-b border-zinc-900 backdrop-blur-md shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">

          {/* Logo Brand */}
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => setCurrentPage('campaigns')}
          >
            <div className="bg-gradient-to-br from-coffee-600 to-coffee-800 p-2 rounded-xl border border-coffee-700/30">
              <Coffee className="w-5 h-5 text-zinc-100" />
            </div>
            <span className="font-black tracking-widest text-lg bg-gradient-to-r from-zinc-50 to-coffee-400 bg-clip-text text-transparent uppercase">
              Brew &amp; Co.
            </span>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1.5 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-1">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setCurrentPage(key)}
                className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                  currentPage === key
                    ? 'bg-coffee-800 text-white shadow-md'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Theme Toggle */}
          <div className="ml-3">
            <ThemeToggle />
          </div>
        </div>
      </nav>

  {/* ── Main Content Area ───────────────────────────────── */}
      <main className="flex-1 bg-zinc-950">
        {currentPage === 'mission-control' && (
          <MissionControl campaignId={activeCampaignId ?? 1} />
        )}
        {currentPage === 'campaigns' && (
          <CampaignsPage onOpenMissionControl={handleOpenMissionControl} />
        )}
        {currentPage === 'customers' && (
          <CustomerExplorer onOpenCustomer360={(customerId) => { setActiveCampaignId(customerId); setCurrentPage('customer-360'); }} />
        )}
        {currentPage === 'templates' && (
          <TemplatesPage />
        )}
        {currentPage === 'customer-360' && (
          <Customer360 id={activeCampaignId} />
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="py-6 border-t border-zinc-900 bg-zinc-950/20 text-center text-xs font-medium text-zinc-600">
        Brew &amp; Co. D2C CRM Campaign Orchestrator © 2026. Powered by Gemini.
      </footer>
    </div>
    </ThemeProvider>
  );
}

export default App;
