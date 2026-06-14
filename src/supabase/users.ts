import { supabase } from "./client.js";
import type { UserRow, UserUpdate, ReceiptRow, ReportRow, Json } from "./types.js";

export async function getUser(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`getUser: ${error.message}`);
  }
  return data;
}

export async function createUser(userId: string, email: string): Promise<UserRow> {
  const { data, error } = await supabase
    .from("users")
    .insert({ id: userId, email })
    .select()
    .single();
  if (error) throw new Error(`createUser: ${error.message}`);
  return data;
}

export async function updateProfile(userId: string, update: UserUpdate): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(`updateProfile: ${error.message}`);
}

export async function createReceipt(
  userId: string,
  imagePath: string,
  motorJson: unknown
): Promise<ReceiptRow> {
  const { data, error } = await supabase
    .from("receipts")
    .insert({ user_id: userId, imagen_path: imagePath, motor_json: motorJson as Json })
    .select()
    .single();
  if (error) throw new Error(`createReceipt: ${error.message}`);
  return data;
}

export async function getUserReceipts(userId: string, limit = 20): Promise<ReceiptRow[]> {
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getUserReceipts: ${error.message}`);
  return data ?? [];
}

export async function saveReport(
  userId: string,
  receiptId: string,
  reportJson: unknown
): Promise<ReportRow> {
  const { data, error } = await supabase
    .from("reports")
    .insert({ user_id: userId, receipt_id: receiptId, report_json: reportJson as Json })
    .select()
    .single();
  if (error) throw new Error(`saveReport: ${error.message}`);
  return data;
}
