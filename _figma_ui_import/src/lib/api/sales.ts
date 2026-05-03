import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

const SALES_JOIN = "*, customer:customer(*), user:user(*), payment:payment(*)";
const SALES_DETAILS_JOIN = "*, customer:customer(*), user:user(*), payment:payment(*), sales_details:sales_details(*, product:product(*))";

export const salesApi = {
  list: () => listRows("sales_transaction", SALES_JOIN, "transaction_date"),
  getById: (id: string) => getRowById("sales_transaction", id, SALES_DETAILS_JOIN),
  create: (payload: any) => createRow("sales_transaction", payload),
  update: (id: string, payload: any) => updateRow("sales_transaction", id, payload),
  remove: (id: string) => removeRow("sales_transaction", id),
};
