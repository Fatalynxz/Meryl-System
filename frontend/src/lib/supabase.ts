import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://vylmcqmxpxqkldosowrs.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5bG1jcW14cHhxa2xkb3Nvd3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjI0MTAsImV4cCI6MjA5MzAzODQxMH0.NxMMQZ3nFQmpYua-zsd5RNgdaA6zgBIm0XR3NDlds2c";

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      // Keep Google/OTP sessions tab-scoped so opening a new tab still shows login.
      storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
