const FLASK_API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type ProductAnalyticsSnapshot = {
  snapshot_id: string;
  product_id: string;
  period_key: "daily" | "weekly" | "monthly" | "quarterly" | "annually" | "custom";
  period_start?: string;
  period_end?: string;
  window_scope?: string | null;
  units_sold: number;
  revenue: number;
  average_unit_price: number;
  stock_quantity: number;
  turnover_ratio: number;
  movement_label: "fast" | "steady" | "slow" | "dead_stock";
  brand?: string | null;
  size_label?: string | null;
  category_name?: string | null;
  rank_position?: number | null;
  computed_at: string;
};

export type ProductAnalyticsDimension = {
  dimension_snapshot_id: string;
  period_key: string;
  period_start?: string;
  period_end?: string;
  window_scope?: string | null;
  dimension_type: "brand" | "size" | "category";
  dimension_value: string;
  units: number;
  revenue: number;
  share_percent: number;
  rank_position: number;
  computed_at: string;
};

export type ProductAnalyticsRecommendation = {
  recommendation_id: string;
  product_id: string;
  period_key: string;
  period_start?: string;
  period_end?: string;
  window_scope?: string | null;
  recommendation_type: "markdown" | "bundle_or_bogo" | "restock_before_promoting";
  title: string;
  message: string;
  severity: "low" | "medium" | "high";
  suggested_discount_min?: number | null;
  suggested_discount_max?: number | null;
  status: "open" | "applied" | "dismissed";
  computed_at: string;
};

export const productAnalyticsSnapshotsApi = {
  fetch: async (
    period: "daily" | "weekly" | "monthly" | "quarterly" | "annually" | "custom" = "monthly",
    options?: { start_date?: string; end_date?: string },
  ) => {
    const params = new URLSearchParams({ period });
    if (options?.start_date) params.set("start_date", options.start_date);
    if (options?.end_date) params.set("end_date", options.end_date);
    const response = await fetch(`${FLASK_API_BASE}/api/analytics/product/snapshots?${params.toString()}`, {
      method: "GET",
      credentials: "include",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || "Unable to fetch persisted product analytics");
    }
    return result as {
      ok: true;
      period: string;
      snapshots: ProductAnalyticsSnapshot[];
      dimensions: ProductAnalyticsDimension[];
      recommendations: ProductAnalyticsRecommendation[];
    };
  },
  rebuild: async (periods?: string[], options?: { start_date?: string; end_date?: string }) => {
    const response = await fetch(`${FLASK_API_BASE}/api/analytics/product/rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        periods,
        start_date: options?.start_date || undefined,
        end_date: options?.end_date || undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || "Unable to rebuild product analytics snapshots");
    }
    return result as {
      ok: true;
      snapshots_written: number;
      dimension_rows_written: number;
      recommendations_written: number;
      periods: string[];
      computed_at: string;
    };
  },
};
