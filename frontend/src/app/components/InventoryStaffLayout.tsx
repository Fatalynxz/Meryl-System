import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ProductManagement } from './ProductManagement';
import { ClipboardList, Package, LogOut, Sparkles, SlidersHorizontal, Warehouse } from 'lucide-react';
import { Button } from './ui/button';
import { NotificationCenter } from './NotificationCenter';
import { useAuth } from '../../lib/auth-context';
import { BrandLogo } from './BrandLogo';
import { InventoryLogPage } from './InventoryLogPage';

export function InventoryStaffLayout() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('product-list');
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { id: 'product-list', label: 'Product List', icon: Package },
    { id: 'product-settings', label: 'Product Settings', icon: SlidersHorizontal },
    { id: 'inventory', label: 'Inventory', icon: Warehouse },
    { id: 'inventory-log', label: 'Inventory Log', icon: ClipboardList },
  ];

  const renderContent = () => {
    switch (activeView) {
      case 'product-list':
        return <ProductManagement view="list" onViewChange={(view) => setActiveView(view === 'list' ? 'product-list' : view === 'settings' ? 'product-settings' : 'inventory')} />;
      case 'product-settings':
        return <ProductManagement view="settings" onViewChange={(view) => setActiveView(view === 'list' ? 'product-list' : view === 'settings' ? 'product-settings' : 'inventory')} />;
      case 'inventory':
        return <ProductManagement view="inventory" onViewChange={(view) => setActiveView(view === 'list' ? 'product-list' : view === 'settings' ? 'product-settings' : 'inventory')} />;
      case 'inventory-log':
        return <InventoryLogPage />;
      default:
        return <ProductManagement view="list" onViewChange={(view) => setActiveView(view === 'list' ? 'product-list' : view === 'settings' ? 'product-settings' : 'inventory')} />;
    }
  };

  const activeLabel = navItems.find(item => item.id === activeView)?.label;

  return (
    <div className="flex h-screen bg-[#0E0E12] text-white p-3 gap-3">
      <aside className="w-64 bg-[#16161C] flex flex-col rounded-2xl border border-white/5 overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex items-center gap-3">
          <BrandLogo size="md" />
          <div>
            <h1 className="text-white text-base leading-none">Meryl Shoes</h1>
            <p className="text-[11px] text-white/40 mt-1">Inventory Portal</p>
          </div>
        </div>
        <div className="px-3"><div className="text-[10px] uppercase tracking-wider text-white/30 px-3 py-2">Menu</div></div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                  isActive
                    ? 'bg-gradient-to-r from-[#E5202A] to-[#B81820] text-white shadow-lg shadow-red-900/30'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD60A]" />}
              </button>
            );
          })}
        </nav>
        <div className="p-3">
          <div className="rounded-2xl p-4 bg-gradient-to-br from-[#FFD60A] to-[#FFB800] text-[#1A1A22] relative overflow-hidden">
            <Sparkles className="absolute -top-2 -right-2 w-16 h-16 opacity-20" />
            <div className="text-xs opacity-70 mb-1">Welcome back</div>
            <div className="text-sm leading-tight truncate">{user?.name || 'Inventory Staff'}</div>
            <Button onClick={handleLogout} className="w-full mt-3 bg-[#1A1A22] hover:bg-black text-white rounded-lg h-8 text-xs">
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#16161C] rounded-2xl border border-white/5">
        <header className="px-8 py-5 flex items-center justify-between border-b border-white/5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/40">Overview</div>
            <h2 className="text-white mt-0.5">{activeLabel}</h2>
          </div>
          <div className="flex items-center gap-3">
            <NotificationCenter />
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E5202A] to-[#FFD60A] flex items-center justify-center text-xs">
              {(user?.name || 'I').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-hide p-8 bg-[#0E0E12]">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
