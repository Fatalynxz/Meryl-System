import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

export const notificationsApi = {
  list: () => listRows("notification", "*, customer:customer(*), promotion:promotion(*)", "date_sent"),
  getById: (id: string) => getRowById("notification", id, "*, customer:customer(*), promotion:promotion(*)"),
  create: (payload: any) => createRow("notification", payload),
  update: (id: string, payload: any) => updateRow("notification", id, payload),
  remove: (id: string) => removeRow("notification", id),
};
