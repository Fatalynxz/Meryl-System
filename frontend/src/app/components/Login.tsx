import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { LogIn, User, Lock, Shield, ShoppingBag, Package, Sparkles, ArrowUpRight } from 'lucide-react';
import logo from "figma:asset/eaa74449f608e0cfccb5e3476772f169ba8ab049.png";
import { useAuth } from '../../lib/auth-context';

type PortalRole = 'admin' | 'sales' | 'inventory';
type DemoUser = { username: string; password: string };

const demoUsers: Record<PortalRole, DemoUser> = {
  admin: { username: 'admin', password: 'admin123' },
  sales: { username: 'sales', password: 'sales123' },
  inventory: { username: 'inventory', password: 'inv123' },
};

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<PortalRole | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const routeByRoleName = (roleName: string) => {
    const normalized = roleName.trim().toLowerCase();
    if (normalized === 'admin' || normalized === 'administrator') return '/admin';
    if (normalized === 'sales' || normalized === 'sales staff') return '/sales';
    if (normalized === 'inventory' || normalized === 'inventory staff') return '/inventory';
    return '/';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const user = await login(username, password);
      if (!user) {
        setError('Invalid username or password');
        return;
      }
      navigate(routeByRoleName(user.role_name));
    } catch {
      setError('Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = (role: PortalRole) => {
    const demo = demoUsers[role];
    setSelectedRole(role);
    setUsername(demo.username);
    setPassword(demo.password);
  };

  const roleOptions = [
    { id: 'admin' as const, label: 'Administrator', desc: 'Full system access', icon: Shield },
    { id: 'sales' as const, label: 'Sales Staff', desc: 'POS · Sales · Customers', icon: ShoppingBag },
    { id: 'inventory' as const, label: 'Inventory Staff', desc: 'Stock · Products · Returns', icon: Package },
  ];

  return (
    <div className="min-h-screen bg-[#0E0E12] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#E5202A]/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#FFD60A]/15 blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full bg-[#E5202A]/10 blur-3xl" />

      <div className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-6 z-10">
        {/* Left: Brand panel */}
        <div className="hidden lg:flex flex-col justify-between rounded-3xl p-8 bg-gradient-to-br from-[#E5202A] via-[#C71820] to-[#7A0F14] relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-72 h-72 rounded-full bg-[#FFD60A]/20 blur-3xl" />
          <div className="absolute right-20 bottom-0 w-48 h-48 rounded-full bg-[#FFD60A]/10 blur-2xl" />

          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <img src={logo} alt="Meryl" className="h-7 w-7 object-contain" />
            </div>
            <div>
              <div className="text-white">Meryl Shoes</div>
              <div className="text-[11px] text-white/70">Management Suite</div>
            </div>
          </div>

          <div className="relative">
            <div className="text-[11px] uppercase tracking-widest text-[#FFD60A]/90">Welcome back</div>
            <h1 className="mt-3 text-white text-4xl tracking-tight leading-tight">
              Run your store<br/>like a fintech.
            </h1>
            <p className="mt-3 text-white/80 text-sm max-w-sm">
              Real-time POS, inventory and sales analytics — designed for speed, built for scale.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-3">
            {[
              { k: 'Revenue', v: '₱248K' },
              { k: 'Customers', v: '892' },
              { k: 'Orders', v: '1.2K' },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl bg-black/20 backdrop-blur p-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-[#FFD60A]/90">{s.k}</div>
                <div className="mt-1 text-white">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Form */}
        <div className="rounded-3xl p-8 bg-[#16161C] border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-[#FFD60A]">Sign in</div>
              <h2 className="mt-1 text-white text-2xl tracking-tight">Login Portal</h2>
            </div>
            <div className="lg:hidden w-10 h-10 rounded-xl bg-gradient-to-br from-[#E5202A] to-[#FFD60A] flex items-center justify-center">
              <img src={logo} alt="Meryl" className="h-6 w-6 object-contain" />
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-white/60 mb-1.5 block">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-[#1D1D25] border border-white/5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD60A]/40 focus:ring-2 focus:ring-[#FFD60A]/20 transition"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-white/60 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-[#1D1D25] border border-white/5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD60A]/40 focus:ring-2 focus:ring-[#FFD60A]/20 transition"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-3 py-2.5 bg-[#E5202A]/15 border border-[#E5202A]/30 text-sm text-[#FF6B72]">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-[#E5202A] to-[#B81820] hover:from-[#C71820] hover:to-[#9A1218] text-white shadow-lg shadow-red-900/30"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign in
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[10px] uppercase tracking-wider text-white/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#FFD60A]" /> Demo quick access
            </span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          <div className="space-y-2">
            {roleOptions.map((r) => {
              const Icon = r.icon;
              const active = selectedRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => quickLogin(r.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition ${
                    active
                      ? 'bg-gradient-to-r from-[#FFD60A] to-[#FFB800] border-[#FFD60A] text-[#1A1A22]'
                      : 'bg-[#1D1D25] border-white/5 text-white/80 hover:border-[#FFD60A]/30 hover:bg-[#24242E]'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    active ? 'bg-[#1A1A22]/10' : 'bg-[#E5202A]/15'
                  }`}>
                    <Icon className={`w-4 h-4 ${active ? 'text-[#1A1A22]' : 'text-[#FF6B72]'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm">{r.label}</div>
                    <div className={`text-[11px] ${active ? 'text-[#1A1A22]/70' : 'text-white/40'}`}>{r.desc}</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 opacity-60" />
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-5 border-t border-white/5 grid grid-cols-3 gap-2 text-[11px]">
            <div className="text-white/40">admin / <span className="text-[#FFD60A]">admin123</span></div>
            <div className="text-white/40">sales / <span className="text-[#FFD60A]">sales123</span></div>
            <div className="text-white/40">inventory / <span className="text-[#FFD60A]">inv123</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
