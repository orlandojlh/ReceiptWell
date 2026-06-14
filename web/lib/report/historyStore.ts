import type { SupabaseClient } from "@supabase/supabase-js";

export interface HistoryEntry {
  fecha: string;
  score: number;
  ahorroAceptadoCLP: number;
}

export interface HistoryStore {
  append(entry: HistoryEntry): Promise<void>;
  recent(n: number): Promise<HistoryEntry[]>;
  totalAhorro(): Promise<number>;
}

// Implementación que recibe un cliente Supabase inyectado
// (permite usar service role en la API route).
export function createWebHistoryStore(
  supabase: SupabaseClient,
  userId: string
): HistoryStore {
  return {
    async append(entry) {
      const { error } = await supabase.from("score_history").insert({
        user_id: userId,
        fecha: entry.fecha,
        score: entry.score,
        ahorro_aceptado_clp: entry.ahorroAceptadoCLP,
      });
      if (error) throw new Error(`HistoryStore.append: ${error.message}`);
    },

    async recent(n) {
      const { data, error } = await supabase
        .from("score_history")
        .select("fecha, score, ahorro_aceptado_clp")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(n);
      if (error) throw new Error(`HistoryStore.recent: ${error.message}`);
      return (data ?? []).map((r) => ({
        fecha: r.fecha as string,
        score: r.score as number,
        ahorroAceptadoCLP: r.ahorro_aceptado_clp as number,
      }));
    },

    async totalAhorro() {
      const { data, error } = await supabase
        .from("score_history")
        .select("ahorro_aceptado_clp")
        .eq("user_id", userId);
      if (error) throw new Error(`HistoryStore.totalAhorro: ${error.message}`);
      return (data ?? []).reduce(
        (sum, r) => sum + (r.ahorro_aceptado_clp as number),
        0
      );
    },
  };
}
