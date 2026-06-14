import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";
import * as dotenv from "dotenv";

// Carga .env.local primero (emulador local), luego .env (producción futura)
dotenv.config({ path: ".env.local" });
dotenv.config();

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL;

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_ANON_KEY. " +
    "Copia .env.local.example a .env.local y completa las credenciales del emulador."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
