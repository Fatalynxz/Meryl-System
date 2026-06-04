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

export const MERYL_USER_STORAGE_KEY = "meryl_user";
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
  login: (username: string, password: string) => Promise<AuthUser | null>;
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

  if (!row || String(row.status ?? "active").toLowerCase() !== "active") {
    return null;
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

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: passwordResetRedirectUrl(),
        shouldCreateUser: false,
      },
    });

    if (error) throw error;
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

    if (!cleanOtp) {
      throw new Error("Enter the OTP sent to your email.");
    }

    const { error: otpError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: cleanOtp,
      type: "email",
    });

    if (otpError) {
      throw new Error(getSupabaseErrorMessage(otpError));
    }

    await updatePasswordAfterRecovery(newPassword);
  }, [updatePasswordAfterRecovery]);

  const markGoogleOtpVerified = useCallback((email: string) => {
    markGoogleOtpVerifiedEmail(email);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { data, error } = await supabase.rpc("login_user", {
      p_username: username,
      p_password: password,
    });

    if (error) throw error;

    const authUser = (data as AuthUser | null) ?? null;
    if (!authUser) return null;

    writeStoredUser(authUser);
    setUser(authUser);
    return authUser;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(MERYL_USER_STORAGE_KEY);
    clearGoogleOtpVerifiedEmail();
    supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
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
      user,
      loading,
      login,
      signInWithGoogle,
      requestPasswordReset,
      updatePasswordAfterRecovery,
      verifyPasswordResetOtpAndUpdate,
      requestEmailOtp,
      completeExternalAuth,
      markGoogleOtpVerified,
      logout,
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
