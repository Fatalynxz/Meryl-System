import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

export const paymentsApi = {
  list: () => listRows("payment", "*, sales_transaction:sales_transaction(*)", "created_at"),
  getById: (id: string) => getRowById("payment", id, "*, sales_transaction:sales_transaction(*)"),
  create: (payload: any) => createRow("payment", payload),
  update: (id: string, payload: any) => updateRow("payment", id, payload),
  remove: (id: string) => removeRow("payment", id),
};
