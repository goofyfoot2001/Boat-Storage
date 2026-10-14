import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. See .env.example.");
}

/**
 * Opened from a "reset your password" email? Checked before the Supabase client reads (and then
 * clears) the sign-in details in the link, so the app knows to ask for a new password.
 */
export const openedFromPasswordReset = /type=recovery/.test(window.location.hash);

export const supabase = createClient(url, key);
