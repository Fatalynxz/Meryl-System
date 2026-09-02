import { useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Lock, Eye, EyeOff, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export function ScreenLockModal() {
  const { user, isLocked, unlockTerminal, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!user || !isLocked) return null;

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setErrorMsg("Please enter your password to unlock.");
      return;
    }

    setIsUnlocking(true);
    setErrorMsg("");

    try {
      const success = await unlockTerminal(password.trim());
      if (success) {
        setPassword("");
        toast.success("Terminal unlocked. Welcome back!");
      } else {
        setErrorMsg("Incorrect password. Please try again.");
        toast.error("Incorrect password.");
      }
    } catch {
      setErrorMsg("Failed to verify password. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  const initial = user.name?.charAt(0).toUpperCase() || "U";

  return (
    <div data-lock-screen="true" className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-[#2a2c3a] bg-[#13131c] p-6 text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        {/* Lock Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-400/30 bg-yellow-400/10 text-yellow-400 shadow-inner">
          <Lock className="h-8 w-8" />
        </div>

        {/* Headings */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">Terminal Locked</h2>
          <p className="text-xs text-yellow-200/60">
            Session paused due to inactivity to protect terminal security.
          </p>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-3 rounded-xl border border-[#282838] bg-[#1a1a27] p-3 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-black font-extrabold text-base shadow-sm">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
            <p className="text-xs text-yellow-200/60 truncate">@{user.username}</p>
          </div>
          <span className="rounded-md border border-[#38384e] bg-[#222232] px-2.5 py-1 text-[11px] font-bold text-yellow-300">
            {user.role_name}
          </span>
        </div>

        {/* Unlock Form */}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="text-xs font-medium text-yellow-200/80">Enter Password to Unlock</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoFocus
                placeholder="Your account password..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                className="h-11 rounded-xl border-[#2f3142] bg-[#1c1c28] pr-10 text-sm text-yellow-100 placeholder:text-zinc-500 focus-visible:ring-yellow-400/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-yellow-300 transition"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errorMsg && (
              <p className="flex items-center gap-1 text-xs text-red-400 mt-1">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                {errorMsg}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isUnlocking}
            className="w-full h-11 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition shadow-md"
          >
            {isUnlocking ? "Verifying..." : "Unlock Terminal"}
          </Button>
        </form>

        {/* Switch Account */}
        <div className="border-t border-[#232332] pt-4">
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-400 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Switch Account / Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
