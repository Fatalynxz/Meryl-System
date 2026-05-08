import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

export const analyticsApi = {
  list: () => listRows("sales_analytics", "*, product:product(*)", "updated_at"),
  getById: (id: string) => getRowById("sales_analytics", id, "*, product:product(*)"),
  create: (payload: any) => createRow("sales_analytics", payload),
  update: (id: string, payload: any) => updateRow("sales_analytics", id, payload),
  remove: (id: string) => removeRow("sales_analytics", id),
};
