import { supabase } from "../supabase";
import type { Database } from "../database.types";

type PublicTables = Database["public"]["Tables"];
export type TableName = keyof PublicTables;
export type Row<T extends TableName> = PublicTables[T]["Row"];
export type Insert<T extends TableName> = PublicTables[T]["Insert"];
export type Update<T extends TableName> = PublicTables[T]["Update"];

const tableIdColumn: Partial<Record<TableName, string>> = {
  role: "role_id",
  user: "user_id",
  customer: "customer_id",
  category: "category_id",
  product: "product_id",
  inventory: "inventory_id",
  inventory_log: "inventory_log_id",
  sales_transaction: "sales_id",
  sales_details: "sales_detail_id",
  payment: "payment_id",
  returns: "return_id",
  return_details: "return_detail_id",
  promotion: "promo_id",
  promo_product: "promo_product_id",
  notification: "notification_id",
  sales_analytics: "analytics_id",
  sales_summary: "summary_id",
  prediction: "prediction_id",
  prediction_history: "history_id",
};

export function getIdColumn<T extends TableName>(table: T): string {
  const id = tableIdColumn[table];
  if (!id) throw new Error(`No id column configured for table ${String(table)}`);
  return id;
}

export async function listRows<T extends TableName>(
  table: T,
  select = "*",
  orderBy?: string,
) {
  let query = supabase.from(table).select(select);
  if (orderBy) query = query.order(orderBy as never, { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Row<T>[];
}

export async function getRowById<T extends TableName>(
  table: T,
  id: string,
  select = "*",
) {
  const idColumn = getIdColumn(table);
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq(idColumn as never, id)
    .single();
  if (error) throw error;
  return data as Row<T>;
}

export async function createRow<T extends TableName>(table: T, payload: Insert<T>) {
  const { data, error } = await supabase.from(table).insert(payload as never).select().single();
  if (error) throw error;
  return data as Row<T>;
}

export async function updateRow<T extends TableName>(
  table: T,
  id: string,
  payload: Update<T>,
) {
  const idColumn = getIdColumn(table);
  const { data, error } = await supabase
    .from(table)
    .update(payload as never)
    .eq(idColumn as never, id)
    .select()
    .single();
  if (error) throw error;
  return data as Row<T>;
}

export async function removeRow<T extends TableName>(table: T, id: string) {
  const idColumn = getIdColumn(table);
  const { error } = await supabase.from(table).delete().eq(idColumn as never, id);
  if (error) throw error;
}

