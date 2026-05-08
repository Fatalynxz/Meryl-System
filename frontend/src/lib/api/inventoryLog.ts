import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

export const inventoryLogApi = {
  list: () => listRows("inventory_log", "*, product:product(*)", "date_updated"),
  getById: (id: string) => getRowById("inventory_log", id, "*, product:product(*)"),
  create: (payload: any) => createRow("inventory_log", payload),
  update: (id: string, payload: any) => updateRow("inventory_log", id, payload),
  remove: (id: string) => removeRow("inventory_log", id),
};
