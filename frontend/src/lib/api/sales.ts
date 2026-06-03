import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";
import { supabase } from "../supabase";

const SALES_JOIN = "*, customer:customer(*), user:user(*), payment:payment(*), sales_details:sales_details(*, product:product(*, category(*), inventory(*)))";
const SALES_DETAILS_JOIN = "*, customer:customer(*), user:user(*), payment:payment(*), sales_details:sales_details(*, product:product(*, category(*), inventory(*)))";

export const salesApi = {
  list: () => listRows("sales_transaction", SALES_JOIN, "transaction_date"),
  listByUser: async (userId: string) => {
    const { data, error } = await supabase
      .from("sales_transaction")
      .select(SALES_JOIN)
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  getById: (id: string) => getRowById("sales_transaction", id, SALES_DETAILS_JOIN),
  create: (payload: any) => createRow("sales_transaction", payload),
  update: (id: string, payload: any) => updateRow("sales_transaction", id, payload),
  remove: (id: string) => removeRow("sales_transaction", id),
};
