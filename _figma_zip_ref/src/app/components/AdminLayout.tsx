import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Dashboard } from './Dashboard';
import { PointOfSale } from './PointOfSale';
import { ProductManagement } from './ProductManagement';
import { SalesManagement } from './SalesManagement';
import { CustomerManagement } from './CustomerManagement';
import { PredictiveAnalytics } from './PredictiveAnalytics';
import { PromotionManagement } from './PromotionManagement';
import { ReportsAnalytics } from './ReportsAnalytics';
import { UserManagement } from './UserManagement';
import { ReturnManagement } from './ReturnManagement';
import { LayoutDashboard, Package, ShoppingCart, Users, CreditCard, TrendingUp, Tag, BarChart3, LogOut, UserCog, RotateCcw, Search, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { NotificationCenter } from './NotificationCenter';
import logo from "figma:asset/eaa74449f608e0cfccb5e3476772f169ba8ab049.png";

export function AdminLayout() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('dashboard');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pos', label: 'Point of Sale', icon: CreditCard },
    { id: 'products', label: 'Inventory', icon: Package },
    { id: 'sales', label: 'Sales', icon: ShoppingCart },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'analytics', label: 'Predictive', icon: TrendingUp },
    { id: 'promotions', label: 'Promotions', icon: Tag },
    { id: 'returns', label: 'Returns', icon: RotateCcw },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: UserCog },
  ];

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'pos': return <PointOfSale />;
      case 'products': return <ProductManagement />;
      case 'sales': return <SalesManagement />;
      case 'customers': return <CustomerManagement />;
      case 'analytics': return <PredictiveAnalytics />;
      case 'promotions': return <PromotionManagement />;
      case 'returns': return <ReturnManagement />;
      case 'reports': return <ReportsAnalytics />;
      case 'users': return <UserManagement />;
      default: return <Dashboard />;
    }
  };

  const activeLabel = navItems.find(item => item.id === activeView)?.label;

  return (
    <div className="flex h-screen bg-[#0E0E12] text-white p-3 gap-3">
      {/* Sidebar */}
      <aside className="w-64 bg-[#16161C] flex flex-col rounded-2xl border border-white/5 overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E5202A] to-[#FFD60A] flex items-center justify-center shadow-lg shadow-red-900/30">
            <img src={logo} alt="Meryl" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <h1 className="text-white text-base leading-none">Meryl Shoes</h1>
            <p className="text-[11px] text-white/40 mt-1">Admin Console</p>
          </div>
        </div>

        <div className="px-3">
          <div className="text-[10px] uppercase tracking-wider text-white/30 px-3 py-2">Menu</div>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm relative ${
                  isActive
                    ? 'bg-gradient-to-r from-[#E5202A] to-[#B81820] text-white shadow-lg shadow-red-900/30'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD60A]" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3">
          <div className="rounded-2xl p-4 bg-gradient-to-br from-[#FFD60A] to-[#FFB800] text-[#1A1A22] relative overflow-hidden">
            <Sparkles className="absolute -top-2 -right-2 w-16 h-16 opacity-20" />
            <div className="text-xs opacity-70 mb-1">Welcome back</div>
            <div className="text-sm leading-tight truncate">{user.name || 'Administrator'}</div>
            <Button
              onClick={handleLogout}
              className="w-full mt-3 bg-[#1A1A22] hover:bg-black text-white rounded-lg h-8 text-xs"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#16161C] rounded-2xl border border-white/5">
        <header className="px-8 py-5 flex items-center justify-between border-b border-white/5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/40">Overview</div>
            <h2 className="text-white mt-0.5">{activeLabel}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 bg-[#1D1D25] rounded-xl px-3 py-2 w-72 border border-white/5">
              <Search className="w-4 h-4 text-white/40" />
              <input
                placeholder="Search anything..."
                className="bg-transparent outline-none text-sm text-white placeholder:text-white/30 flex-1"
              />
              <kbd className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">⌘K</kbd>
            </div>
            <NotificationCenter />
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E5202A] to-[#FFD60A] flex items-center justify-center text-xs">
              {(user.name || 'A').charAt(0).toUpperCase()}
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
