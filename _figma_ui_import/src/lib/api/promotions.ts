import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

const PROMO_JOIN = "*, promo_product:promo_product(*, product:product(*))";

export const promotionsApi = {
  list: () => listRows("promotion", PROMO_JOIN, "created_at"),
  getById: (id: string) => getRowById("promotion", id, PROMO_JOIN),
  create: (payload: any) => createRow("promotion", payload),
  update: (id: string, payload: any) => updateRow("promotion", id, payload),
  remove: (id: string) => removeRow("promotion", id),
};
