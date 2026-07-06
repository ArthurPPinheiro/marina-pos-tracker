import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Se as variáveis não estiverem configuradas, o app funciona só com localStorage.
export const supabaseEnabled = Boolean(url && key);
export const supabase = supabaseEnabled ? createClient(url, key) : null;

// Um único "espaço de estudo". Todo o estado vive numa linha só.
export const SPACE_ID = "marina";
export const TABLE = "study_state";
