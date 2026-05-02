from datetime import datetime


def get_or_create_customer(
    customer_name,
    email="",
    phone="",
    address="",
    *,
    fetch_rows,
    supabase,
    normalize_customer_rows,
):
    normalized_name = (customer_name or "").strip() or "Walk-in Customer"
    normalized_email = (email or "").strip().lower()
    normalized_phone = (phone or "").strip()
    customers = fetch_rows("customer")
    existing_customer = next(
        (
            row
            for row in customers
            if str(row.get("customer_name", "")).strip().lower() == normalized_name.lower()
            or (normalized_email and str(row.get("email", "")).strip().lower() == normalized_email)
        ),
        None,
    )
    if existing_customer:
        return existing_customer

    payload = {
        "name": normalized_name,
        "email": normalized_email or None,
        "contact_number": normalized_phone or None,
        "date_registered": datetime.now().date().isoformat(),
    }
    created = supabase.table("customer").insert(payload).execute().data or []
    if created:
        return normalize_customer_rows(created)[0]
    return payload


def build_customer_lookup(*, fetch_rows):
    return {row["customer_id"]: row for row in fetch_rows("customer")}


def build_customer_rows(
    *,
    fetch_rows,
    build_sale_status_maps,
    safe_int,
    safe_float,
    parse_iso_datetime,
    datetime_cls,
):
    def normalize_id(value):
        return str(value or "").strip()

    customers = fetch_rows("customer")
    sales_transactions = fetch_rows("sales_transaction")
    sales_details = fetch_rows("sales_details")
    completed_sales, denied_sales = build_sale_status_maps()
    sales_by_customer = {}
    quantity_by_sale = {}
    for sale in sales_transactions:
        customer_id = normalize_id(sale.get("customer_id"))
        if customer_id:
            sales_by_customer.setdefault(customer_id, []).append(sale)
    for detail in sales_details:
        sale_id = normalize_id(detail.get("sales_id"))
        if not sale_id:
            continue
        quantity_by_sale[sale_id] = quantity_by_sale.get(sale_id, 0) + safe_int(detail.get("quantity"), 0)

    customer_rows = []
    for customer in customers:
        customer_sales = sales_by_customer.get(normalize_id(customer.get("customer_id")), [])
        latest_sale = max(
            customer_sales,
            key=lambda sale: parse_iso_datetime(sale.get("transaction_date")) or datetime_cls.min,
            default=None,
        )
        counted_customer_sales = [
            sale
            for sale in customer_sales
            if normalize_id(sale.get("sales_id")) not in denied_sales
        ]
        total_spent = sum(safe_float(sale.get("total_amount"), 0) for sale in counted_customer_sales)
        purchase_count = sum(
            quantity_by_sale.get(normalize_id(sale.get("sales_id")), 0)
            for sale in counted_customer_sales
        )
        latest_counted_sale = max(
            counted_customer_sales,
            key=lambda sale: parse_iso_datetime(sale.get("transaction_date")) or datetime_cls.min,
            default=None,
        )
        last_sale = parse_iso_datetime(latest_counted_sale.get("transaction_date")) if latest_counted_sale else None
        latest_sale_id = normalize_id(latest_sale.get("sales_id")) if latest_sale else ""
        transaction_status = "No transaction"
        transaction_status_tone = "muted"
        if latest_sale_id:
            if latest_sale_id in denied_sales:
                transaction_status = "Denied"
                transaction_status_tone = "danger"
            elif latest_sale_id in completed_sales:
                transaction_status = "Completed"
                transaction_status_tone = "success"
            else:
                transaction_status = "Pending"
                transaction_status_tone = "warning"

        customer_rows.append(
            {
                "customer_id": customer.get("customer_id"),
                "name": customer.get("customer_name", "Unknown"),
                "contact": customer.get("email") or "-",
                "phone": customer.get("phone") or "-",
                "address": customer.get("address") or "No address",
                "purchases": purchase_count,
                "last_purchase": last_sale.strftime("%Y-%m-%d") if last_sale else "No purchase",
                "loyalty_points": int(total_spent // 10),
                "status": str(customer.get("status", "active")).title(),
                "transaction_status": transaction_status,
                "transaction_status_tone": transaction_status_tone,
            }
        )

    return customer_rows


def build_customer_form_data(form):
    name = (form.get("name") or "").strip()
    email = (form.get("username") or "").strip().lower()
    phone = (form.get("phone") or "").strip()

    if not name:
        return {
            "error": "Customer name is required.",
            "error_tone": "danger",
        }

    return {
        "error": None,
        "error_tone": None,
        "payload": {
            "name": name,
            "email": email or None,
            "contact_number": phone or None,
        },
    }


def delete_customer_record(customer_id, *, supabase):
    customer_sales = (
        supabase.table("sales_transaction")
        .select("sales_id")
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    if customer_sales.data:
        return {"blocked": True, "deleted": False, "missing": False}

    delete_result = (
        supabase.table("customer")
        .delete()
        .eq("customer_id", customer_id)
        .execute()
    )
    return {
        "blocked": False,
        "deleted": bool(delete_result.data),
        "missing": not bool(delete_result.data),
    }
