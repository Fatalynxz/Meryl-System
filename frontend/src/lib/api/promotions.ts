import { getRowById, listRows, removeRow } from "./_common";

const PROMO_JOIN = "*, promo_product:promo_product(*, product:product(*))";
const API_BASE =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5000"
    : "");

function apiUrl(path: string) {
  const base = String(API_BASE || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export const promotionsApi = {
  list: () => listRows("promotion", PROMO_JOIN, "created_at"),
  getById: (id: string) => getRowById("promotion", id, PROMO_JOIN),
  create: async (payload: any) => {
    const response = await fetch(apiUrl("/api/promotions/public"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let result: any = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      result = {};
    }
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || `Unable to create promotion (HTTP ${response.status} ${response.statusText}) ${raw ? `- ${raw.slice(0, 300)}` : ""}`.trim());
    }
    return result.promotion ?? result;
  },
  update: async (id: string, payload: any) => {
    const response = await fetch(apiUrl(`/api/promotions/${encodeURIComponent(id)}/public`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let result: any = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      result = {};
    }
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || `Unable to update promotion (HTTP ${response.status} ${response.statusText}) ${raw ? `- ${raw.slice(0, 300)}` : ""}`.trim());
    }
    return result.promotion ?? result;
  },
  remove: (id: string) => removeRow("promotion", id),
};
