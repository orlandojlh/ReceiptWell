import type { User } from "@supabase/supabase-js";
import { supabase } from "./client.js";

export type { User };

// ─── signup ──────────────────────────────────────────────────────────────────

export async function signup(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(`signup: ${error.message}`);
  if (!data.user) throw new Error("signup: no user devuelto");
  return data.user;
}

// ─── login ───────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login: ${error.message}`);
  if (!data.user) throw new Error("login: no user devuelto");
  return data.user;
}

// ─── loginGoogle ─────────────────────────────────────────────────────────────

export async function loginGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: process.env.SUPABASE_REDIRECT_URL ?? "http://127.0.0.1:3000/auth/callback",
    },
  });
  if (error) throw new Error(`loginGoogle: ${error.message}`);
  // El navegador redirige al proveedor — no hay User disponible inmediatamente en CLI
}

// ─── logout ──────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`logout: ${error.message}`);
}

// ─── getCurrentUser ──────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

// ─── getSession ──────────────────────────────────────────────────────────────

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`getSession: ${error.message}`);
  return data.session;
}
