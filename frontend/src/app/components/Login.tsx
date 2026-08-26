import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { ArrowLeft, KeyRound, LogIn, Mail, User, Lock, ShieldCheck, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { getPostLoginPath, useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { BrandLogo } from './BrandLogo';


export function Login() {
  const navigate = useNavigate();
  const { login, signInWithGoogle, requestPasswordReset, verifyPasswordResetOtpAndUpdate } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState<'email' | 'otp'>('email');
  const [forgotMode, setForgotMode] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [externalSubmitting, setExternalSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  useEffect(() => {
    const resetExternalSubmitting = () => {
      setExternalSubmitting(false);
    };

    window.addEventListener('pageshow', resetExternalSubmitting);
    window.addEventListener('focus', resetExternalSubmitting);
    return () => {
      window.removeEventListener('pageshow', resetExternalSubmitting);
      window.removeEventListener('focus', resetExternalSubmitting);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      // Step 1: Validate credentials WITHOUT triggering auth context redirect
      const { data, error: rpcError } = await supabase.rpc('login_user', {
        p_username: username,
        p_password: password,
      });

      if (rpcError) throw rpcError;
      if (!data) {
        setError('Invalid username or password');
        setSubmitting(false);
        return;
      }

      // Step 2: Show success overlay on the login page
      setLoginSuccess(true);

      // Step 3: After 1.5s, actually call login() which sets user state and triggers redirect
      setTimeout(async () => {
        await login(username, password);
      }, 3000);
    } catch {
      setError('Invalid username or password');
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

  const handleForgotPassword = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      await requestPasswordReset(resetEmail);
      setResetStep('otp');
      setResetOtp('');
      setResetPassword('');
      setResetConfirmPassword('');
      setNotice('OTP sent. Enter the code from your email, then set your new password.');
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'Unable to send password reset OTP right now.';
      setError(message.includes('rate limit') ? 'Email rate limit exceeded. Please wait before requesting another OTP.' : message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      if (resetPassword.trim().length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (resetPassword !== resetConfirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      await verifyPasswordResetOtpAndUpdate(resetEmail, resetOtp, resetPassword);
      setNotice('Password updated successfully. You can now sign in with your new password.');
      window.setTimeout(() => {
        setForgotMode(false);
        setResetStep('email');
        setResetOtp('');
        setResetPassword('');
        setResetConfirmPassword('');
        setPassword('');
      }, 1200);
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'Unable to verify OTP right now.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForgotState = () => {
    setForgotMode(false);
    setResetStep('email');
    setResetOtp('');
    setResetPassword('');
    setResetConfirmPassword('');
    setError('');
    setNotice('');
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
              <h2 className="mt-1 text-white text-2xl tracking-tight">
                {forgotMode ? 'Reset Password' : 'Login Portal'}
              </h2>
            </div>
            <BrandLogo size="sm" className="lg:hidden" />
          </div>

          {forgotMode ? (
          <form onSubmit={resetStep === 'email' ? handleForgotPassword : handleVerifyResetOtp} className="space-y-4">
            <div>
              <label className="text-xs text-white/60 mb-1.5 block">Registered email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="email"
                  placeholder="Enter registered email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={resetStep === 'otp'}
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-[#1D1D25] border border-white/5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD60A]/40 focus:ring-2 focus:ring-[#FFD60A]/20 transition"
                />
              </div>
            </div>

            {resetStep === 'otp' && (
              <>
                <div>
                  <label className="text-xs text-white/60 mb-1.5 block">Email OTP code</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Enter OTP code"
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      className="w-full pl-10 pr-3 py-2.5 bg-[#1D1D25] border border-white/5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD60A]/40 focus:ring-2 focus:ring-[#FFD60A]/20 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 mb-1.5 block">New password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="password"
                      placeholder="At least 8 characters"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-3 py-2.5 bg-[#1D1D25] border border-white/5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD60A]/40 focus:ring-2 focus:ring-[#FFD60A]/20 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60 mb-1.5 block">Confirm password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="password"
                      placeholder="Re-enter new password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-3 py-2.5 bg-[#1D1D25] border border-white/5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD60A]/40 focus:ring-2 focus:ring-[#FFD60A]/20 transition"
                    />
                  </div>
                </div>
              </>
            )}

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
              className="w-full h-11 rounded-xl bg-[#FFD60A] hover:bg-[#ffcf24] text-[#15151B] shadow-lg shadow-yellow-900/20"
            >
              {resetStep === 'email' ? <Mail className="w-4 h-4 mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              {resetStep === 'email' ? 'Send Reset OTP' : 'Verify OTP and Reset Password'}
            </Button>

            {resetStep === 'otp' && (
              <Button
                type="button"
                disabled={submitting}
                onClick={handleForgotPassword}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#1D1D25] text-white hover:bg-white/10"
              >
                <Mail className="w-4 h-4 mr-2" />
                Resend OTP
              </Button>
            )}

            <Button
              type="button"
              disabled={submitting}
              onClick={resetForgotState}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#1D1D25] text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Button>
          </form>
          ) : (
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
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-[#1D1D25] border border-white/5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFD60A]/40 focus:ring-2 focus:ring-[#FFD60A]/20 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-3 py-2.5 bg-[#E5202A]/15 border border-[#E5202A]/30 text-sm text-[#FF6B72]">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-xl px-4 py-3 bg-emerald-500/20 border border-emerald-400/40 text-sm text-emerald-200 flex items-center gap-2.5 transition-all duration-300">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="font-medium">{notice}</span>
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
          )}

          {!forgotMode && (
          <>
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
              {externalSubmitting ? 'Opening Google...' : 'Continue with Google'}
            </Button>
            <p className="px-1 text-[11px] leading-4 text-white/45">
              Google sign-in now includes OTP verification before access.
            </p>
          </div>
          </>
          )}

        </div>
      </div>

      {/* Login Success Overlay */}
      {loginSuccess && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#16161C] border border-emerald-500/30 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl shadow-emerald-900/20 max-w-sm mx-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            </div>
            <h3 className="text-white text-xl font-semibold">Login Successful!</h3>
            <p className="text-white/60 text-sm text-center">Redirecting to your portal...</p>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden mt-2">
              <div className="h-full bg-emerald-400 rounded-full" style={{ animation: 'progressBar 3s ease-in-out forwards' }} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progressBar {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
