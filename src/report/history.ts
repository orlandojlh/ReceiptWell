import * as fs from "fs";
import * as path from "path";

export interface HistoryEntry {
  fecha: string;
  score: number;
  ahorroAceptadoCLP: number;
}

// Interfaz async — la implementación local usa Promise.resolve(),
// la implementación Supabase hace llamadas reales a la DB.
export interface HistoryStore {
  append(entry: HistoryEntry): Promise<void>;
  recent(n: number): Promise<HistoryEntry[]>;
  totalAhorro(): Promise<number>;
}

// ─── Implementación local (JSON en disco) ────────────────────────────────────

const HISTORY_PATH = path.join(process.cwd(), "data", "history.json");

function readAll(): HistoryEntry[] {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: HistoryEntry[]): void {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export function createLocalHistoryStore(): HistoryStore {
  return {
    async append(entry) {
      const all = readAll();
      all.push(entry);
      writeAll(all);
    },
    async recent(n) {
      return readAll().slice(-n);
    },
    async totalAhorro() {
      return readAll().reduce((sum, e) => sum + e.ahorroAceptadoCLP, 0);
    },
  };
}

// ─── Implementación Supabase ──────────────────────────────────────────────────

export async function createSupabaseHistoryStore(userId: string): Promise<HistoryStore> {
  // Import dinámico para no requerir credenciales en contextos sin Supabase
  const { supabase } = await import("../supabase/client.js");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return {
    async append(entry) {
      const { error } = await db
        .from("score_history")
        .insert({
          user_id: userId,
          fecha: entry.fecha,
          score: entry.score,
          ahorro_aceptado_clp: entry.ahorroAceptadoCLP,
        });
      if (error) throw new Error(`HistoryStore.append: ${(error as { message: string }).message}`);
    },

    async recent(n) {
      const { data, error } = await db
        .from("score_history")
        .select("fecha, score, ahorro_aceptado_clp")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(n);
      if (error) throw new Error(`HistoryStore.recent: ${(error as { message: string }).message}`);
      return ((data as { fecha: string; score: number; ahorro_aceptado_clp: number }[]) ?? []).map((r) => ({
        fecha: r.fecha,
        score: r.score,
        ahorroAceptadoCLP: r.ahorro_aceptado_clp,
      }));
    },

    async totalAhorro() {
      const { data, error } = await db
        .from("score_history")
        .select("ahorro_aceptado_clp")
        .eq("user_id", userId);
      if (error) throw new Error(`HistoryStore.totalAhorro: ${(error as { message: string }).message}`);
      return ((data as { ahorro_aceptado_clp: number }[]) ?? []).reduce((sum, r) => sum + r.ahorro_aceptado_clp, 0);
    },
  };
}
