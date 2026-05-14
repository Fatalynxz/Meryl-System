import { getRowById, listRows, removeRow } from "./_common";

const PROMO_JOIN = "*, promo_product:promo_product(*, product:product(*))";

export const promotionsApi = {
  list: () => listRows("promotion", PROMO_JOIN, "created_at"),
  getById: (id: string) => getRowById("promotion", id, PROMO_JOIN),
  create: async (payload: any) => {
    const response = await fetch("/api/promotions/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || "Unable to create promotion");
    }
    return result.promotion ?? result;
  },
  update: async (id: string, payload: any) => {
    const response = await fetch(`/api/promotions/${encodeURIComponent(id)}/public`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || "Unable to update promotion");
    }
    return result.promotion ?? result;
  },
  remove: (id: string) => removeRow("promotion", id),
};
