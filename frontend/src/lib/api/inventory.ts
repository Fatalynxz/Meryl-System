import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

export const inventoryApi = {
  list: () => listRows("inventory", "*, product:product(*)", "last_updated"),
  getById: (id: string) => getRowById("inventory", id, "*, product:product(*)"),
  create: (payload: any) => createRow("inventory", payload),
  update: (id: string, payload: any) => updateRow("inventory", id, payload),
  remove: (id: string) => removeRow("inventory", id),
};
