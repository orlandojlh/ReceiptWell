/**
 * Tipos generados manualmente del esquema definido en
 * supabase/migrations/20240101000000_initial_schema.sql
 *
 * Para regenerar desde el emulador (cuando esté corriendo):
 *   supabase gen types typescript --local > src/supabase/types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          nombre: string;
          objetivo: "ahorrar" | "salud" | "equilibrio";
          adultos: number;
          ninos: number;
          condiciones: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          nombre?: string;
          objetivo?: "ahorrar" | "salud" | "equilibrio";
          adultos?: number;
          ninos?: number;
          condiciones?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nombre?: string;
          objetivo?: "ahorrar" | "salud" | "equilibrio";
          adultos?: number;
          ninos?: number;
          condiciones?: string[];
          updated_at?: string;
        };
      };
      receipts: {
        Row: {
          id: string;
          user_id: string;
          imagen_path: string | null;
          imagen_hash: string | null;
          procesado_ia: boolean;
          motor_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          imagen_path?: string | null;
          imagen_hash?: string | null;
          procesado_ia?: boolean;
          motor_json: Json;
          created_at?: string;
        };
        Update: {
          imagen_path?: string | null;
          imagen_hash?: string | null;
          procesado_ia?: boolean;
          motor_json?: Json;
        };
      };
      reports: {
        Row: {
          id: string;
          user_id: string;
          receipt_id: string;
          report_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          receipt_id: string;
          report_json: Json;
          created_at?: string;
        };
        Update: {
          report_json?: Json;
        };
      };
      score_history: {
        Row: {
          id: string;
          user_id: string;
          fecha: string;
          score: number;
          ahorro_aceptado_clp: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fecha: string;
          score: number;
          ahorro_aceptado_clp?: number;
          created_at?: string;
        };
        Update: {
          ahorro_aceptado_clp?: number;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      objetivo_enum: "ahorrar" | "salud" | "equilibrio";
    };
  };
};

// Aliases convenientes
export type UserRow         = Database["public"]["Tables"]["users"]["Row"];
export type UserInsert      = Database["public"]["Tables"]["users"]["Insert"];
export type UserUpdate      = Database["public"]["Tables"]["users"]["Update"];

export type ReceiptRow      = Database["public"]["Tables"]["receipts"]["Row"];
export type ReceiptInsert   = Database["public"]["Tables"]["receipts"]["Insert"];

export type ReportRow       = Database["public"]["Tables"]["reports"]["Row"];
export type ReportInsert    = Database["public"]["Tables"]["reports"]["Insert"];

export type ScoreHistoryRow    = Database["public"]["Tables"]["score_history"]["Row"];
export type ScoreHistoryInsert = Database["public"]["Tables"]["score_history"]["Insert"];
