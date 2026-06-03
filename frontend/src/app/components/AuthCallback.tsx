import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { getPostLoginPath, useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";

export function AuthCallback() {
  const navigate = useNavigate();
  const { completeExternalAuth, requestEmailOtp, markGoogleOtpVerified, logout } = useAuth();
  const [error, setError] = useState("");
  const [otpMode, setOtpMode] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpNotice, setOtpNotice] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function finishSignIn() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const provider = String(session?.user?.app_metadata?.provider ?? "").toLowerCase();
        const sessionEmail = String(session?.user?.email ?? "").trim().toLowerCase();

        const appUser = await completeExternalAuth({
          persist: provider !== "google",
          bypassOtpGate: provider === "google",
        });

        if (!mounted) return;

        if (!appUser) {
          logout();
          setError(
            "This Google/email account is not linked to an active Meryl staff account. Ask an admin to add the same email in Users.",
          );
          return;
        }

        if (provider === "google") {
          setOtpMode(true);
          setOtpEmail(sessionEmail);
          try {
            setSendingOtp(true);
            await requestEmailOtp(sessionEmail);
            if (mounted) {
              setOtpNotice("We sent an OTP/sign-in code to your email. Enter it below to continue.");
            }
          } finally {
            if (mounted) setSendingOtp(false);
          }
          return;
        }

        navigate(getPostLoginPath(appUser), { replace: true });
      } catch (authError) {
        if (!mounted) return;
        logout();
        setError(
          authError instanceof Error
            ? authError.message
            : "We could not finish Google/email sign-in. Please try again.",
        );
      }
    }

    finishSignIn();

    return () => {
      mounted = false;
    };
  }, [completeExternalAuth, logout, navigate, requestEmailOtp]);

  const handleVerifyOtp = async () => {
    if (verifyingOtp || !otpEmail) return;
    if (!otpCode.trim()) {
      setError("Enter the OTP code from your email.");
      return;
    }

    try {
      setVerifyingOtp(true);
      setError("");
      setOtpNotice("");
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: otpCode.trim(),
        type: "email",
      });

      if (verifyError) throw verifyError;

      markGoogleOtpVerified(otpEmail);
      const appUser = await completeExternalAuth({ persist: true });
      if (!appUser) {
        throw new Error("Could not complete sign-in after OTP verification.");
      }

      navigate(getPostLoginPath(appUser), { replace: true });
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : "Invalid OTP code. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpEmail || sendingOtp) return;
    try {
      setSendingOtp(true);
      setError("");
      await requestEmailOtp(otpEmail);
      setOtpNotice("OTP sent again. Check your email inbox.");
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : "Could not resend OTP.");
    } finally {
      setSendingOtp(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E12] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#16161C] p-7 shadow-2xl">
        {!error && !otpMode ? (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFD60A]/15 text-[#FFD60A]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold">Finishing sign-in</h1>
            <p className="mt-2 text-sm text-white/60">
              We are verifying your email and matching it to your Meryl staff role.
            </p>
          </div>
        ) : otpMode ? (
          <div>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFD60A]/15 text-[#FFD60A]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Verify OTP to continue</h1>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Google sign-in succeeded. Enter the OTP sent to <span className="text-white">{otpEmail}</span> to access the system.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl px-3 py-2.5 bg-[#E5202A]/15 border border-[#E5202A]/30 text-sm text-[#FF8B91]">
                {error}
              </div>
            )}

            {otpNotice && (
              <div className="mt-4 rounded-xl px-3 py-2.5 bg-emerald-500/10 border border-emerald-400/25 text-sm text-emerald-200">
                {otpNotice}
              </div>
            )}

            <div className="mt-4">
              <label className="mb-1.5 block text-xs text-white/60">Email OTP code</label>
              <input
                type="text"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="Enter OTP code"
                className="h-11 w-full rounded-xl border border-white/5 bg-[#1D1D25] px-3 text-sm text-white placeholder:text-white/30 transition focus:border-[#FFD60A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFD60A]/20"
              />
              <p className="mt-1.5 text-[11px] text-white/45">
                OTP codes usually expire within a few minutes. If it expires, tap <span className="text-white/70">Resend OTP</span>.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                onClick={handleVerifyOtp}
                disabled={verifyingOtp || sendingOtp}
                className="h-11 flex-1 rounded-xl bg-[#FFD60A] font-semibold text-[#17171D] hover:bg-[#ffcf24]"
              >
                {verifyingOtp ? "Verifying..." : "Verify and Continue"}
              </Button>
              <Button
                type="button"
                onClick={handleResendOtp}
                disabled={verifyingOtp || sendingOtp}
                className="h-11 rounded-xl border border-white/10 bg-[#1D1D25] text-white hover:bg-white/10"
              >
                {sendingOtp ? "Sending..." : "Resend OTP"}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E5202A]/15 text-[#FF8B91]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Sign-in needs setup</h1>
                <p className="mt-2 text-sm leading-6 text-white/65">{error}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#FFD60A]/20 bg-[#FFD60A]/10 p-4 text-sm text-[#F7D75A]">
              <div className="flex items-center gap-2 font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-[#FFD60A]" />
                Quick check
              </div>
              <p className="mt-2 text-xs leading-5">
                The email used for Google or OTP must exactly exist in the Users page and the account must be Active.
              </p>
            </div>

            <Button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="mt-6 h-11 w-full rounded-xl bg-[#FFD60A] font-semibold text-[#17171D] hover:bg-[#ffcf24]"
            >
              Back to Login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
