import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

export const rolesApi = {
  list: () => listRows("role", "*", "created_at"),
  getById: (id: string) => getRowById("role", id),
  create: (payload: any) => createRow("role", payload),
  update: (id: string, payload: any) => updateRow("role", id, payload),
  remove: (id: string) => removeRow("role", id),
};

