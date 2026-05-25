import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { LogIn, User, Lock, Mail, ShieldCheck } from 'lucide-react';
import { getPostLoginPath, useAuth } from '../../lib/auth-context';
import { BrandLogo } from './BrandLogo';


export function Login() {
  const navigate = useNavigate();
  const { login, signInWithGoogle, requestEmailOtp } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [externalSubmitting, setExternalSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const user = await login(username, password);
      if (!user) {
        setError('Invalid username or password');
        return;
      }
      navigate(getPostLoginPath(user));
    } catch {
      setError('Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (externalSubmitting) return;
    setExternalSubmitting(true);
    setError('');
    setNotice('');

    try {
      await signInWithGoogle();
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Google sign-in is not available right now.');
      setExternalSubmitting(false);
    }
  };

  const handleEmailOtp = async () => {
    if (externalSubmitting) return;
    if (!staffEmail.trim()) {
      setError('Enter your staff email first.');
      return;
    }

    setExternalSubmitting(true);
    setError('');
    setNotice('');

    try {
      await requestEmailOtp(staffEmail);
      setNotice('Check your email for the sign-in link or OTP. Use the same email saved in the Users page.');
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : 'Could not send the email sign-in link.');
    } finally {
      setExternalSubmitting(false);
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

          <div className="relative flex items-center gap-4">
            <BrandLogo size="xl" className="ring-white/60 shadow-[0_18px_45px_rgba(0,0,0,0.5)]" />
            <div>
              <div className="text-white text-xl font-bold tracking-wide">Meryl Shoes</div>
              <div className="text-xs text-white/80">Admin Console</div>
            </div>
          </div>

          <div className="relative">
            <div className="text-[11px] uppercase tracking-widest text-[#FFD60A]/90">Welcome back</div>
            <h1 className="mt-3 text-white text-4xl tracking-tight leading-tight">
              Run your store<br/>with confidence.
            </h1>
            <p className="mt-3 text-white/80 text-sm max-w-sm">
              Real-time POS, inventory, and sales analytics designed for daily operations.
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

            {notice && (
              <div className="rounded-xl px-3 py-2.5 bg-emerald-500/10 border border-emerald-400/25 text-sm text-emerald-200">
                {notice}
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
            <div className="h-px flex-1 bg-white/10" />
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/40">
              <ShieldCheck className="h-3.5 w-3.5 text-[#FFD60A]" />
              Secure options
            </div>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              disabled={externalSubmitting || submitting}
              onClick={handleGoogleLogin}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#1D1D25] text-white hover:bg-white/10"
            >
              <span className="mr-2 grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-bold text-[#E5202A]">
                G
              </span>
              Continue with Google
            </Button>

            <div className="rounded-2xl border border-white/10 bg-[#111117] p-3">
              <label className="text-xs text-white/60 mb-1.5 block">Email OTP / sign-in link</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <input
                    type="email"
                    value={staffEmail}
                    onChange={(event) => setStaffEmail(event.target.value)}
                    placeholder="staff@email.com"
                    className="h-11 w-full rounded-xl border border-white/5 bg-[#1D1D25] pl-10 pr-3 text-sm text-white placeholder:text-white/30 transition focus:border-[#FFD60A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD60A]/20"
                  />
                </div>
                <Button
                  type="button"
                  disabled={externalSubmitting || submitting}
                  onClick={handleEmailOtp}
                  className="h-11 rounded-xl bg-[#FFD60A] px-5 font-semibold text-[#17171D] hover:bg-[#ffcf24]"
                >
                  Send OTP
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-white/45">
                Google and OTP only work when the email exists in Users and the account is Active.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
