import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { LogIn, User, Lock } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { BrandLogo } from './BrandLogo';


export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
            <BrandLogo size="lg" className="ring-white/25" />
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
          <div className="relative h-16" />
        </div>

        {/* Right: Form */}
        <div className="rounded-3xl p-8 bg-[#16161C] border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-[#FFD60A]">Sign in</div>
              <h2 className="mt-1 text-white text-2xl tracking-tight">Login Portal</h2>
            </div>
            <BrandLogo size="sm" className="lg:hidden" />
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

        </div>
      </div>
    </div>
  );
}
