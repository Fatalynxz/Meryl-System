import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "./BrandLogo";

function getResetErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error) {
    const record = error as { message?: unknown; error_description?: unknown; details?: unknown };
    return String(record.message ?? record.error_description ?? record.details ?? "Unable to update password right now.");
  }
  return "Unable to update password right now.";
}

export function ResetPassword() {
  const navigate = useNavigate();
  const { updatePasswordAfterRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadRecoverySession() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!mounted) return;

        const sessionEmail = String(session?.user?.email ?? "").trim().toLowerCase();
        setEmail(sessionEmail);
        if (!sessionEmail) {
          setError("Password reset link is invalid or expired. Please request a new reset link.");
        }
      } catch {
        if (mounted) {
          setError("Password reset link is invalid or expired. Please request a new reset link.");
        }
      } finally {
        if (mounted) setLoadingSession(false);
      }
    }

    loadRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      if (password.trim().length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      await updatePasswordAfterRecovery(password);
      setNotice("Password updated successfully. You can now sign in with your new password.");
      window.setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (resetError) {
      setError(getResetErrorMessage(resetError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E12] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-[#E5202A]/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-[#FFD60A]/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#16161C] p-8 shadow-2xl">
        <div className="mb-7 flex items-center gap-4">
          <BrandLogo size="md" />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-[#FFD60A]">Meryl Shoes</div>
            <h1 className="mt-1 text-2xl tracking-tight text-white">Set New Password</h1>
          </div>
        </div>

        {loadingSession ? (
          <div className="rounded-xl border border-white/10 bg-[#1D1D25] px-4 py-5 text-sm text-white/60">
            Checking reset link...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-[#FFD60A]/20 bg-[#FFD60A]/10 px-3 py-2.5 text-sm text-yellow-100">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FFD60A]" />
                <span>
                  Resetting password for <strong>{email || "your account"}</strong>.
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-white/60">New password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  required
                  className="w-full rounded-xl border border-white/5 bg-[#1D1D25] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 transition focus:border-[#FFD60A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD60A]/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-white/60">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className="w-full rounded-xl border border-white/5 bg-[#1D1D25] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 transition focus:border-[#FFD60A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD60A]/20"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-[#E5202A]/30 bg-[#E5202A]/15 px-3 py-2.5 text-sm text-[#FF6B72]">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200">
                {notice}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !email}
              className="h-11 w-full rounded-xl bg-[#FFD60A] text-[#15151B] shadow-lg shadow-yellow-900/20 hover:bg-[#ffcf24]"
            >
              Update Password
            </Button>

            <Button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#1D1D25] text-white hover:bg-white/10"
            >
              Back to Login
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
