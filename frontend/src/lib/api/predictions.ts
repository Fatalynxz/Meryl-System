import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

const PREDICTION_JOIN = "*, product:product(*), prediction_history:prediction_history(*)";

export const predictionsApi = {
  list: () => listRows("prediction", PREDICTION_JOIN, "prediction_date"),
  getById: (id: string) => getRowById("prediction", id, PREDICTION_JOIN),
  create: (payload: any) => createRow("prediction", payload),
  update: (id: string, payload: any) => updateRow("prediction", id, payload),
  remove: (id: string) => removeRow("prediction", id),
};
