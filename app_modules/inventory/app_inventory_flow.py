from datetime import datetime


def complete_sale_inventory(
    sales_id,
    *,
    build_sale_status_maps,
    supabase,
    safe_int,
    get_inventory_row,
    upsert_inventory_record,
    sync_sales_analytics_entry,
    safe_float,
    table_exists,
    db_payment_status,
    sync_sales_summary_entry,
):
    completed_sales, denied_sales = build_sale_status_maps()
    if sales_id in denied_sales:
        raise ValueError("Denied transactions cannot be completed.")
    if sales_id in completed_sales:
        raise ValueError("Transaction is already completed.")

    sale_details = supabase.table("sales_details").select("*").eq("sales_id", sales_id).execute().data or []
    if not sale_details:
        raise ValueError("No sale details found for this transaction.")

    timestamp = datetime.now().isoformat()
    for detail in sale_details:
        product_id = safe_int(detail.get("product_id"), 0)
        quantity = max(0, safe_int(detail.get("quantity"), 0))
        if product_id <= 0 or quantity <= 0:
            continue

        inventory_row = get_inventory_row(product_id) or {}
        current_stock = safe_int(inventory_row.get("stock_quantity"), 0)
        if quantity > current_stock:
            raise ValueError("Quantity exceeds available stock for one or more items.")

        remaining_stock = current_stock - quantity
        upsert_inventory_record(
            product_id,
            remaining_stock,
            inventory_row.get("reorder_level", 10),
            reference_id=sales_id,
        )
        supabase.table("product").update(
            {"status": "Available" if remaining_stock > 0 else "Not Available"}
        ).eq("product_id", product_id).execute()
        supabase.table("inventory_log").insert(
            {
                "product_id": product_id,
                "quantity_change": -quantity,
                "transaction_type": "Sale",
                "reference_id": sales_id,
                "date_updated": timestamp,
            }
        ).execute()
        sync_sales_analytics_entry(product_id, quantity, safe_float(detail.get("subtotal"), 0))

    if table_exists("payment"):
        supabase.table("payment").update({"payment_status": db_payment_status("paid")}).eq(
            "sales_id", sales_id
        ).execute()
    sale_rows = (
        supabase.table("sales_transaction").select("transaction_date").eq("sales_id", sales_id).limit(1).execute().data or []
    )
    if sale_rows:
        sync_sales_summary_entry(str(sale_rows[0].get("transaction_date") or ""))


def delete_inventory_product(product_id, *, supabase):
    related_sales = (
        supabase.table("sales_details")
        .select("sales_detail_id")
        .eq("product_id", product_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if related_sales:
        return {"blocked": True, "deleted": False}

    supabase.table("promo_product").delete().eq("product_id", product_id).execute()
    supabase.table("inventory").delete().eq("product_id", product_id).execute()
    supabase.table("inventory_log").delete().eq("product_id", product_id).execute()
    prediction_rows = (
        supabase.table("prediction").select("prediction_id").eq("product_id", product_id).execute().data or []
    )
    for prediction_row in prediction_rows:
        supabase.table("prediction_history").delete().eq(
            "prediction_id", prediction_row.get("prediction_id")
        ).execute()
    supabase.table("prediction").delete().eq("product_id", product_id).execute()
    supabase.table("sales_analytics").delete().eq("product_id", product_id).execute()
    supabase.table("product").delete().eq("product_id", product_id).execute()
    return {"blocked": False, "deleted": True}
