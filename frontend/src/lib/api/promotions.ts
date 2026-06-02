import { getRowById, listRows, removeRow } from "./_common";
import { supabase } from "../supabase";

const PROMO_JOIN = "*, promo_product:promo_product(*, product:product(*))";

function withoutOptionalPromotionColumns(payload: any) {
  const { target_products: _targetProducts, target_sales_goal: _targetSalesGoal, ...fallback } = payload;
  return fallback;
}

export const promotionsApi = {
  list: () => listRows("promotion", PROMO_JOIN, "created_at"),
  getById: (id: string) => getRowById("promotion", id, PROMO_JOIN),
  create: async (payload: any) => {
    const createPayload = {
      promo_name: payload?.promo_name,
      discount_type: payload?.discount_type,
      discount_value: payload?.discount_value,
      target_sales_goal: payload?.target_sales_goal,
      target_products: payload?.target_products,
      start_date: payload?.start_date,
      end_date: payload?.end_date,
      status: payload?.status,
    } as any;

    // Prefer direct Supabase insert so optional promotion fields such as
    // target_sales_goal persist even when the Flask compatibility route lags.
    let dbCreate = await supabase
      .from("promotion")
      .insert(createPayload)
      .select("*")
      .single();

    if (dbCreate.error && String(dbCreate.error.message || "").toLowerCase().includes("target_sales_goal")) {
      dbCreate = await supabase
        .from("promotion")
        .insert(withoutOptionalPromotionColumns(createPayload))
        .select("*")
        .single();
    }

    if (dbCreate.error && String(dbCreate.error.message || "").toLowerCase().includes("target_products")) {
      dbCreate = await supabase
        .from("promotion")
        .insert(withoutOptionalPromotionColumns(createPayload))
        .select("*")
        .single();
    }

    if (!dbCreate.error && dbCreate.data) {
      return dbCreate.data;
    }

    // Secondary fallback: Flask route (legacy compatibility).
    const response = await fetch("/api/promotions/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(createPayload),
    });
    const raw = await response.text();
    let result: any = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      result = {};
    }
    if (response.ok && result?.ok !== false) {
      return result.promotion ?? result;
    }

    throw new Error(
      result?.error ||
      dbCreate.error?.message ||
      `Unable to create promotion (HTTP ${response.status} ${response.statusText}) ${raw ? `- ${raw.slice(0, 300)}` : ""}`.trim(),
    );
  },
  update: async (id: string, payload: any) => {
    const updatePayload = {
      promo_name: payload?.promo_name,
      discount_type: payload?.discount_type,
      discount_value: payload?.discount_value,
      target_sales_goal: payload?.target_sales_goal,
      target_products: payload?.target_products,
      start_date: payload?.start_date,
      end_date: payload?.end_date,
      status: payload?.status,
    } as any;

    // Prefer direct Supabase update so local Flask session/config issues
    // do not block promotion edits from the modal.
    let dbUpdate = await supabase
      .from("promotion")
      .update(updatePayload)
      .eq("promo_id", id)
      .select("*")
      .single();

    if (dbUpdate.error && String(dbUpdate.error.message || "").toLowerCase().includes("target_sales_goal")) {
      dbUpdate = await supabase
        .from("promotion")
        .update(withoutOptionalPromotionColumns(updatePayload))
        .eq("promo_id", id)
        .select("*")
        .single();
    }

    if (dbUpdate.error && String(dbUpdate.error.message || "").toLowerCase().includes("target_products")) {
      dbUpdate = await supabase
        .from("promotion")
        .update(withoutOptionalPromotionColumns(updatePayload))
        .eq("promo_id", id)
        .select("*")
        .single();
    }

    if (!dbUpdate.error && dbUpdate.data) {
      return dbUpdate.data;
    }

    // Secondary fallback: Flask route (legacy compatibility).
    const response = await fetch(`/api/promotions/${encodeURIComponent(id)}/public`, {
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
      throw new Error(
        result?.error ||
          dbUpdate.error?.message ||
          `Unable to update promotion (HTTP ${response.status} ${response.statusText}) ${raw ? `- ${raw.slice(0, 300)}` : ""}`.trim(),
      );
    }
    return result.promotion ?? result;
  },
  remove: (id: string) => removeRow("promotion", id),
};
