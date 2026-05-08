import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";
export const customersApi = {
  list: () => listRows("customer", "*", "created_at"),
  getById: (id: string) => getRowById("customer", id),
  create: (payload: any) => createRow("customer", payload),
  update: (id: string, payload: any) => updateRow("customer", id, payload),
  remove: (id: string) => removeRow("customer", id),
};
