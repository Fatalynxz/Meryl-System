import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";
export const categoriesApi = {
  list: () => listRows("category", "*", "created_at"),
  getById: (id: string) => getRowById("category", id),
  create: (payload: any) => createRow("category", payload),
  update: (id: string, payload: any) => updateRow("category", id, payload),
  remove: (id: string) => removeRow("category", id),
};
