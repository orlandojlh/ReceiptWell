import { supabase } from "./client.js";
import type { ReceiptRow, ReportRow } from "./types.js";

export async function uploadReceiptImage(
  userId: string,
  fileName: string,
  data: Buffer | Uint8Array
): Promise<{ path: string }> {
  const storagePath = `${userId}/${fileName}`;
  const { error } = await supabase.storage
    .from("receipts")
    .upload(storagePath, data, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`uploadReceiptImage: ${error.message}`);
  return { path: storagePath };
}

export async function getReceipt(receiptId: string): Promise<ReceiptRow | null> {
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`getReceipt: ${error.message}`);
  }
  return data;
}

export async function getReports(receiptId: string): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("receipt_id", receiptId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getReports: ${error.message}`);
  return data ?? [];
}
