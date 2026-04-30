def format_prediction_period_label(value):
    mapping = {
        "last30": "Last 30 Days",
        "weekly": "Weekly",
        "yearly": "Yearly",
        "last6": "Last 6 Months",
        "last12": "Last 12 Months",
    }
    normalized = str(value or "").strip().lower()
    return mapping.get(normalized, str(value or "Forecast").replace("_", " ").title())


def sync_sales_analytics_entry(product_id, quantity_delta, amount_delta, *, safe_int, supabase, safe_float):
    product_id = safe_int(product_id, 0)
    if product_id <= 0:
        return

    analytics_rows = supabase.table("sales_analytics").select("*").eq("product_id", product_id).execute().data or []
    payload = {
        "product_id": product_id,
        "total_quantity_sold": max(0, quantity_delta),
        "total_sales": max(0, amount_delta),
        "average_sales": max(0, amount_delta / quantity_delta) if quantity_delta > 0 else 0,
        "trend_type": "Rising" if amount_delta > 0 else "Steady",
        "time_period": "Monthly",
    }
    if analytics_rows:
        current = analytics_rows[0]
        payload["total_quantity_sold"] = max(0, safe_int(current.get("total_quantity_sold"), 0) + quantity_delta)
        payload["total_sales"] = max(0, safe_float(current.get("total_sales"), 0) + amount_delta)
        payload["average_sales"] = (
            payload["total_sales"] / payload["total_quantity_sold"]
            if payload["total_quantity_sold"] > 0
            else 0
        )
        supabase.table("sales_analytics").update(payload).eq("product_id", product_id).execute()
    else:
        supabase.table("sales_analytics").insert(payload).execute()


def sync_prediction_results(
    prediction_payloads,
    *,
    fetch_rows,
    safe_int,
    safe_float,
    supabase,
    table_exists,
):
    if not prediction_payloads:
        return

    try:
        existing_predictions = fetch_rows("prediction")
        for payload in prediction_payloads:
            payload = dict(payload)
            product_id = safe_int(payload.get("product_id"), 0)
            if product_id <= 0:
                continue

            prediction_period = str(payload.get("prediction_period") or "").strip()
            history_payload = {
                "actual_sales": max(0, safe_float(payload.pop("actual_sales", 0), 0)),
                "prediction_accuracy": max(0, min(100, safe_float(payload.pop("prediction_accuracy", 0), 0))),
            }
            existing_row = next(
                (
                    row
                    for row in existing_predictions
                    if safe_int(row.get("product_id"), 0) == product_id
                    and str(row.get("prediction_period") or "").strip().lower() == prediction_period.lower()
                ),
                None,
            )
            if existing_row and safe_int(existing_row.get("prediction_id"), 0) > 0:
                supabase.table("prediction").update(payload).eq(
                    "prediction_id",
                    existing_row.get("prediction_id"),
                ).execute()
                prediction_id = safe_int(existing_row.get("prediction_id"), 0)
            else:
                created = supabase.table("prediction").insert(payload).execute().data or []
                prediction_id = safe_int((created[0] if created else {}).get("prediction_id"), 0)

            if prediction_id > 0 and table_exists("prediction_history"):
                existing_history = (
                    supabase.table("prediction_history")
                    .select("history_id")
                    .eq("prediction_id", prediction_id)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if existing_history:
                    supabase.table("prediction_history").update(history_payload).eq(
                        "history_id", existing_history[0].get("history_id")
                    ).execute()
                else:
                    supabase.table("prediction_history").insert(
                        {"prediction_id": prediction_id, **history_payload}
                    ).execute()
    except Exception:
        pass
