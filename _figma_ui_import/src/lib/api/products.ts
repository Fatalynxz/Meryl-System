import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

const PRODUCT_JOIN = "*, category:category(*), inventory:inventory(*)";

export const productsApi = {
  list: () => listRows("product", PRODUCT_JOIN, "created_at"),
  getById: (id: string) => getRowById("product", id, PRODUCT_JOIN),
  create: (payload: any) => createRow("product", payload),
  update: (id: string, payload: any) => updateRow("product", id, payload),
  remove: (id: string) => removeRow("product", id),
};
