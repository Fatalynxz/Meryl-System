import { createRow, getRowById, listRows, removeRow, updateRow } from "./_common";

const PRODUCT_JOIN = "*, category(*), inventory(*)";

function isMissingImageUrlError(error: any) {
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    msg.includes("image_url") &&
    (msg.includes("could not find") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist") ||
      msg.includes("column"))
  );
}

export const productsApi = {
  list: () => listRows("product", PRODUCT_JOIN, "created_at"),
  getById: (id: string) => getRowById("product", id, PRODUCT_JOIN),
  create: async (payload: any) => {
    try {
      return await createRow("product", payload);
    } catch (error: any) {
      if (isMissingImageUrlError(error) && "image_url" in payload) {
        const { image_url, ...restPayload } = payload;
        return await createRow("product", restPayload);
      }
      throw error;
    }
  },
  update: async (id: string, payload: any) => {
    try {
      return await updateRow("product", id, payload);
    } catch (error: any) {
      if (isMissingImageUrlError(error) && "image_url" in payload) {
        const { image_url, ...restPayload } = payload;
        return await updateRow("product", id, restPayload);
      }
      throw error;
    }
  },
  remove: (id: string) => removeRow("product", id),
};
