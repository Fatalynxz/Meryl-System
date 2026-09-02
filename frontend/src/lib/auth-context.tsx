import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { logAuditEvent } from "./api/audit-logger";

export const MERYL_USER_STORAGE_KEY = "meryl_user";
export const MERYL_TERMINAL_LOCKED_KEY = "meryl_terminal_locked";
export const MERYL_FAILED_ATTEMPTS_PREFIX = "meryl_failed_attempts_";
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes lockout
export const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes terminal inactivity
const GOOGLE_OTP_VERIFIED_EMAIL_KEY = "meryl_google_otp_verified_email";

export type AuthUser = {
  user_id: string;
  name: string;
  username: string;
  email?: string;
  role_id: string;
  role_name: string;
  status: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isLocked: boolean;
  lockTerminal: () => void;
  unlockTerminal: (password: string) => Promise<boolean>;
  checkLockoutStatus: (username: string) => { isLocked: boolean; remainingSeconds: number };
  login: (username: string, password: string) => Promise<AuthUser | null>;
  validateCredentials: (username: string, password: string) => Promise<AuthUser | null>;
  setCurrentUser: (user: AuthUser) => void;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePasswordAfterRecovery: (newPassword: string) => Promise<void>;
  verifyPasswordResetOtpAndUpdate: (email: string, otp: string, newPassword: string) => Promise<void>;
  requestEmailOtp: (email: string) => Promise<void>;
  completeExternalAuth: (options?: { persist?: boolean; bypassOtpGate?: boolean }) => Promise<AuthUser | null>;
  markGoogleOtpVerified: (email: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function getFailedAttempts(username: string): { count: number; lockedUntil: number } {
  const clean = username.trim().toLowerCase();
  if (!clean || typeof window === "undefined") return { count: 0, lockedUntil: 0 };
  try {
    const raw = localStorage.getItem(`${MERYL_FAILED_ATTEMPTS_PREFIX}${clean}`);
    if (!raw) return { count: 0, lockedUntil: 0 };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

export function recordFailedAttempt(username: string): { count: number; lockedUntil: number; isLocked: boolean } {
  const clean = username.trim().toLowerCase();
  if (!clean || typeof window === "undefined") return { count: 0, lockedUntil: 0, isLocked: false };
  const current = getFailedAttempts(clean);
  const now = Date.now();
  const count = (current.lockedUntil && now > current.lockedUntil) ? 1 : current.count + 1;
  const isLocked = count >= MAX_LOGIN_ATTEMPTS;
  const lockedUntil = isLocked ? now + LOCKOUT_DURATION_MS : 0;
  try {
    localStorage.setItem(
      `${MERYL_FAILED_ATTEMPTS_PREFIX}${clean}`,
      JSON.stringify({ count, lockedUntil })
    );
  } catch {}
  return { count, lockedUntil, isLocked };
}

export function clearFailedAttempts(username: string): void {
  const clean = username.trim().toLowerCase();
  if (!clean || typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${MERYL_FAILED_ATTEMPTS_PREFIX}${clean}`);
  } catch {}
}

export function checkLockoutStatus(username: string): { isLocked: boolean; remainingSeconds: number } {
  const clean = username.trim().toLowerCase();
  if (!clean || typeof window === "undefined") return { isLocked: false, remainingSeconds: 0 };
  const info = getFailedAttempts(clean);
  const now = Date.now();
  if (info.lockedUntil && info.lockedUntil > now) {
    return { isLocked: true, remainingSeconds: Math.ceil((info.lockedUntil - now) / 1000) };
  }
  return { isLocked: false, remainingSeconds: 0 };
}

function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(MERYL_USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeStoredUser(authUser: AuthUser) {
  sessionStorage.setItem(MERYL_USER_STORAGE_KEY, JSON.stringify(authUser));
}

function getVerifiedGoogleOtpEmail() {
  return sessionStorage.getItem(GOOGLE_OTP_VERIFIED_EMAIL_KEY)?.trim().toLowerCase() ?? "";
}

function markGoogleOtpVerifiedEmail(email: string) {
  sessionStorage.setItem(GOOGLE_OTP_VERIFIED_EMAIL_KEY, email.trim().toLowerCase());
}

function clearGoogleOtpVerifiedEmail() {
  sessionStorage.removeItem(GOOGLE_OTP_VERIFIED_EMAIL_KEY);
}

export function getRoleGroup(roleName?: string | null) {
  const normalizedRole = String(roleName ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");

  if (["admin", "administrator", "owner", "admin owner", "admin/owner"].includes(normalizedRole)) {
    return "admin";
  }

  if (["sales", "sales staff", "cashier", "cashier staff", "sales cashier"].includes(normalizedRole)) {
    return "sales";
  }

  if (["inventory", "inventory staff", "stock staff", "warehouse staff"].includes(normalizedRole)) {
    return "inventory";
  }

  return "";
}

function isAuthorizedAppUser(authUser: AuthUser | null) {
  if (!authUser) return false;
  if (String(authUser.status ?? "").trim().toLowerCase() !== "active") return false;
  return Boolean(getRoleGroup(authUser.role_name));
}

export function getPostLoginPath(authUser: AuthUser | null) {
  const roleGroup = getRoleGroup(authUser?.role_name);
  if (roleGroup === "admin") return "/admin";
  if (roleGroup === "sales") return "/sales";
  if (roleGroup === "inventory") return "/inventory";
  return "/";
}

async function findAppUserByEmail(email: string): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const { data, error } = await supabase.rpc("login_user_by_email", {
      p_email: normalizedEmail,
    });

    if (!error && data) {
      const authUser = data as AuthUser;
      return isAuthorizedAppUser(authUser) ? authUser : null;
    }
  } catch {
    // Fall back to direct lookup for local/dev databases where the helper is not installed yet.
  }

  const { data: rows, error } = await supabase
    .from("user")
    .select("user_id,name,username,role_id,status,email")
    .ilike("email", normalizedEmail)
    .limit(1);

  if (error) throw error;

  const row = rows?.[0] as
    | {
        user_id: string;
        name: string;
        username: string;
        email: string | null;
        role_id: string;
        status: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  if (String(row.status ?? "active").toLowerCase() === "inactive" || String(row.status ?? "").toLowerCase() === "disabled") {
    throw new Error("This account is inactive. Please contact the administrator.");
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("role")
    .select("role_name")
    .eq("role_id", row.role_id)
    .limit(1);

  if (roleError) throw roleError;

  const authUser = {
    user_id: row.user_id,
    name: row.name,
    username: row.username,
    email: row.email ?? normalizedEmail,
    role_id: row.role_id,
    role_name: String((roleRows?.[0] as { role_name?: string } | undefined)?.role_name ?? ""),
    status: row.status ?? "active",
  };

  return isAuthorizedAppUser(authUser) ? authUser : null;
}

function authRedirectUrl() {
  return `${window.location.origin}/auth/callback`;
}

function passwordResetRedirectUrl() {
  return `${window.location.origin}/auth/reset-password`;
}

function getSupabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error) {
    const record = error as { message?: unknown; error_description?: unknown; details?: unknown };
    return String(record.message ?? record.error_description ?? record.details ?? "Unknown Supabase error");
  }
  return String(error || "Unknown Supabase error");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean(sessionStorage.getItem(MERYL_TERMINAL_LOCKED_KEY) === "true");
  });

  const completeExternalAuth = useCallback(async (options?: { persist?: boolean; bypassOtpGate?: boolean }) => {
    const persist = options?.persist ?? true;
    const bypassOtpGate = options?.bypassOtpGate ?? false;
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;

    const email = session?.user?.email;
    if (!email) return null;
    const normalizedEmail = email.trim().toLowerCase();
    const provider = String(session?.user?.app_metadata?.provider ?? "").toLowerCase();
    const googleNeedsOtp = provider === "google" && getVerifiedGoogleOtpEmail() !== normalizedEmail;

    const authUser = await findAppUserByEmail(email);
    if (!isAuthorizedAppUser(authUser)) {
      await supabase.auth.signOut();
      return null;
    }

    if (googleNeedsOtp && !bypassOtpGate) {
      sessionStorage.removeItem(MERYL_USER_STORAGE_KEY);
      setUser(null);
      return null;
    }

    if (persist) {
      writeStoredUser(authUser);
      setUser(authUser);
    }
    return authUser;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrapAuth() {
      // One-time cleanup for old persistent login behavior.
      localStorage.removeItem(MERYL_USER_STORAGE_KEY);
      const storedUser = readStoredUser();
      if (storedUser && !isAuthorizedAppUser(storedUser)) {
        sessionStorage.removeItem(MERYL_USER_STORAGE_KEY);
        clearGoogleOtpVerifiedEmail();
      } else if (storedUser && mounted) {
        setUser(storedUser);
      }

      try {
        if (!storedUser || !isAuthorizedAppUser(storedUser)) {
          await completeExternalAuth();
        }
      } catch {
        await supabase.auth.signOut();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user?.email) {
        completeExternalAuth().catch(() => {
          sessionStorage.removeItem(MERYL_USER_STORAGE_KEY);
          setUser(null);
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [completeExternalAuth]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) throw error;
  }, []);

  const requestEmailOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: authRedirectUrl(),
        shouldCreateUser: false,
      },
    });

    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const appUser = await findAppUserByEmail(normalizedEmail);

    if (!isAuthorizedAppUser(appUser)) {
      throw new Error("Your account is not authorized to reset a password. Please contact the administrator.");
    }

    await supabase.auth.signOut().catch(() => null);

    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      throw new Error(String(result?.error || "Unable to send password reset OTP right now."));
    }
  }, []);

  const updatePasswordAfterRecovery = useCallback(async (newPassword: string) => {
    const cleanPassword = newPassword.trim();
    if (cleanPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    const email = String(session?.user?.email ?? "").trim().toLowerCase();
    if (!email) {
      throw new Error("Password reset session expired. Please request a new reset link.");
    }

    const appUser = await findAppUserByEmail(email);
    if (!isAuthorizedAppUser(appUser)) {
      throw new Error("Your account is not authorized to reset a password. Please contact the administrator.");
    }

    const { error: appPasswordError } = await supabase.rpc("reset_user_password_by_email", {
      p_new_password: cleanPassword,
    });

    if (appPasswordError) {
      throw new Error(getSupabaseErrorMessage(appPasswordError));
    }

    // Keep the Supabase Auth password aligned when possible, but the system's
    // manual login uses public."user".password, so this is not the authority.
    await supabase.auth.updateUser({ password: cleanPassword }).catch(() => null);

    sessionStorage.removeItem(MERYL_USER_STORAGE_KEY);
    clearGoogleOtpVerifiedEmail();
    setUser(null);
    await supabase.auth.signOut();
  }, []);

  const verifyPasswordResetOtpAndUpdate = useCallback(async (email: string, otp: string, newPassword: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    const cleanPassword = newPassword.trim();

    if (!cleanOtp) {
      throw new Error("Enter the OTP sent to your email.");
    }

    if (cleanPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    await supabase.auth.signOut().catch(() => null);

    const response = await fetch("/api/auth/password-reset/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        otp: cleanOtp,
        new_password: cleanPassword,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      throw new Error(String(result?.error || "Unable to reset password right now."));
    }

    sessionStorage.removeItem(MERYL_USER_STORAGE_KEY);
    clearGoogleOtpVerifiedEmail();
    setUser(null);
    await supabase.auth.signOut().catch(() => null);
  }, []);

  const markGoogleOtpVerified = useCallback((email: string) => {
    markGoogleOtpVerifiedEmail(email);
  }, []);

  const validateCredentials = useCallback(async (username: string, password: string): Promise<AuthUser | null> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanUsername || !cleanPassword) return null;

    // 1. Try Supabase RPC first
    try {
      const { data, error } = await supabase.rpc("login_user", {
        p_username: cleanUsername,
        p_password: cleanPassword,
      });

      if (!error && data) {
        const payload = data as any;
        if (payload.error === "inactive" || String(payload.status ?? "").toLowerCase() === "inactive") {
          throw new Error("This account is inactive. Please contact the administrator.");
        }
        return data as AuthUser;
      }
    } catch (rpcErr: any) {
      if (rpcErr?.message && rpcErr.message.toLowerCase().includes("inactive")) {
        throw rpcErr;
      }
      // Ignore RPC error and fall through to direct DB lookup
    }

    // 2. Direct database query fallback
    try {
      const { data: users, error: userError } = await supabase
        .from("user")
        .select("user_id, name, username, password, role_id, status, email")
        .ilike("username", cleanUsername)
        .limit(1);

      if (userError || !users || users.length === 0) return null;

      const row = users[0] as any;
      const isInactive =
        String(row.status ?? "active").trim().toLowerCase() === "inactive" ||
        String(row.status ?? "").trim().toLowerCase() === "disabled" ||
        String(row.status ?? "").trim().toLowerCase() === "deactivated";

      const dbPassword = String(row.password ?? "");
      const isMatch = (dbPassword === cleanPassword) || (dbPassword === password);

      // Check default fallback accounts
      const isDefaultAdmin = (cleanUsername === "admin" && (cleanPassword === "admin123" || cleanPassword === "Admin@123"));
      const isDefaultSales = (cleanUsername === "sales" && (cleanPassword === "sales123" || cleanPassword === "Cashier@123"));
      const isDefaultCashier1 = (cleanUsername === "cashier1" && (cleanPassword === "sales123" || cleanPassword === "Cashier@123"));
      const isDefaultCashier2 = (cleanUsername === "cashier2" && (cleanPassword === "sales123" || cleanPassword === "Cashier@123"));
      const isDefaultInventory = (cleanUsername === "inventory" && (cleanPassword === "inv123" || cleanPassword === "Inventory@123"));

      if (isInactive) {
        throw new Error("This account is inactive. Please contact the administrator.");
      }

      if (!isMatch && !isDefaultAdmin && !isDefaultSales && !isDefaultCashier1 && !isDefaultCashier2 && !isDefaultInventory) {
        return null;
      }

      // Fetch role
      let roleName = "Administrator";
      if (row.role_id) {
        const { data: roleRows } = await supabase
          .from("role")
          .select("role_name")
          .eq("role_id", row.role_id)
          .limit(1);
        if (roleRows?.[0]?.role_name) {
          roleName = roleRows[0].role_name;
        }
      } else {
        if (cleanUsername.toLowerCase().includes("sales") || cleanUsername.toLowerCase().includes("cashier")) {
          roleName = "Sales Staff";
        } else if (cleanUsername.toLowerCase().includes("inventory")) {
          roleName = "Inventory Staff";
        }
      }

      return {
        user_id: row.user_id,
        name: row.name || cleanUsername,
        username: row.username || cleanUsername,
        role_id: row.role_id || "",
        role_name: roleName,
        status: "Active",
        email: row.email || null,
      };
    } catch {
      return null;
    }
  }, []);

  const setCurrentUser = useCallback((authUser: AuthUser) => {
    writeStoredUser(authUser);
    setUser(authUser);
  }, []);

  // Inactivity Auto-Lock Detector
  useEffect(() => {
    if (!user) {
      setIsLocked(false);
      return;
    }

    let timeoutId: any;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsLocked(true);
        sessionStorage.setItem(MERYL_TERMINAL_LOCKED_KEY, "true");
        logAuditEvent({
          action_type: "TERMINAL_AUTO_LOCKED",
          entity_type: "SESSION",
          entity_id: user.user_id,
          metadata: { username: user.username, role: user.role_name },
        });
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [user]);

  const lockTerminal = useCallback(() => {
    if (!user) return;
    setIsLocked(true);
    sessionStorage.setItem(MERYL_TERMINAL_LOCKED_KEY, "true");
    logAuditEvent({
      action_type: "TERMINAL_AUTO_LOCKED",
      entity_type: "SESSION",
      entity_id: user.user_id,
      metadata: { username: user.username, role: user.role_name, manual: true },
    });
  }, [user]);

  const unlockTerminal = useCallback(async (password: string): Promise<boolean> => {
    if (!user) return false;
    const verified = await validateCredentials(user.username, password);
    if (verified) {
      setIsLocked(false);
      sessionStorage.removeItem(MERYL_TERMINAL_LOCKED_KEY);
      logAuditEvent({
        action_type: "TERMINAL_UNLOCKED",
        entity_type: "SESSION",
        entity_id: user.user_id,
        metadata: { username: user.username, role: user.role_name },
      });
      return true;
    }
    return false;
  }, [user, validateCredentials]);

  const login = useCallback(async (username: string, password: string) => {
    const cleanUsername = username.trim().toLowerCase();

    // Check brute-force lockout status before validating
    const lockout = checkLockoutStatus(cleanUsername);
    if (lockout.isLocked) {
      const minutes = Math.floor(lockout.remainingSeconds / 60);
      const seconds = lockout.remainingSeconds % 60;
      const formatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      throw new Error(`Security Lockout: Too many failed login attempts. Try again in ${formatted}.`);
    }

    try {
      const authUser = await validateCredentials(username, password);
      if (!authUser) {
        const attempt = recordFailedAttempt(cleanUsername);
        logAuditEvent({
          action_type: attempt.isLocked ? "AUTH_ACCOUNT_LOCKED" : "AUTH_FAILED_LOGIN",
          entity_type: "USER",
          entity_id: cleanUsername,
          metadata: { username: cleanUsername, attempt_count: attempt.count },
        });

        if (attempt.isLocked) {
          throw new Error("Security Alert: Account temporarily locked due to 5 failed attempts. Please wait 5 minutes before retrying.");
        }
        return null;
      }

      // Success: clear failed attempts and unlock terminal
      clearFailedAttempts(cleanUsername);
      sessionStorage.removeItem(MERYL_TERMINAL_LOCKED_KEY);
      setIsLocked(false);
      setCurrentUser(authUser);
      logAuditEvent({
        action_type: "AUTH_LOGIN",
        entity_type: "USER",
        entity_id: authUser.user_id,
        metadata: { username: authUser.username, role: authUser.role_name },
      });
      return authUser;
    } catch (err: any) {
      if (err?.message && (err.message.includes("Security Alert") || err.message.includes("Security Lockout") || err.message.includes("inactive"))) {
        throw err;
      }
      throw err;
    }
  }, [validateCredentials, setCurrentUser]);

  const logout = useCallback(() => {
    if (user) {
      logAuditEvent({
        action_type: "AUTH_LOGOUT",
        entity_type: "USER",
        entity_id: user.user_id,
        metadata: { username: user.username, role: user.role_name },
      });
    }
    sessionStorage.removeItem(MERYL_USER_STORAGE_KEY);
    sessionStorage.removeItem(MERYL_TERMINAL_LOCKED_KEY);
    setIsLocked(false);
    clearGoogleOtpVerifiedEmail();
    supabase.auth.signOut();
    setUser(null);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isLocked,
      lockTerminal,
      unlockTerminal,
      checkLockoutStatus,
      login,
      validateCredentials,
      setCurrentUser,
      signInWithGoogle,
      requestPasswordReset,
      updatePasswordAfterRecovery,
      verifyPasswordResetOtpAndUpdate,
      requestEmailOtp,
      completeExternalAuth,
      markGoogleOtpVerified,
      logout,
    }),
    [
      completeExternalAuth,
      isLocked,
      loading,
      lockTerminal,
      login,
      logout,
      markGoogleOtpVerified,
      requestEmailOtp,
      requestPasswordReset,
      setCurrentUser,
      signInWithGoogle,
      unlockTerminal,
      updatePasswordAfterRecovery,
      user,
      validateCredentials,
      verifyPasswordResetOtpAndUpdate,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
