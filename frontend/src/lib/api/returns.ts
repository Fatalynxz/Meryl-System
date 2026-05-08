import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

const RETURNS_JOIN = "*, sales_transaction:sales_transaction(*), user:user(*)";
const RETURNS_DETAILS_JOIN = "*, sales_transaction:sales_transaction(*), user:user(*), return_details:return_details(*, product:product(*))";

export const returnsApi = {
  list: () => listRows("returns", RETURNS_JOIN, "return_date"),
  getById: (id: string) => getRowById("returns", id, RETURNS_DETAILS_JOIN),
  create: (payload: any) => createRow("returns", payload),
  update: (id: string, payload: any) => updateRow("returns", id, payload),
  remove: (id: string) => removeRow("returns", id),
};
