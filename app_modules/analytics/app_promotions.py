from collections import defaultdict
from datetime import datetime


def sync_promotion_notifications(
    promo_id,
    *,
    safe_int,
    table_exists,
    supabase,
    build_sale_status_maps,
    fetch_rows,
    build_customer_lookup,
):
    promo_id = safe_int(promo_id, 0)
    if promo_id <= 0 or not table_exists("notification"):
        return

    supabase.table("notification").delete().eq("promo_id", promo_id).execute()

    promo_product_rows = (
        supabase.table("promo_product").select("product_id").eq("promo_id", promo_id).execute().data or []
    )
    product_ids = {
        safe_int(row.get("product_id"), 0)
        for row in promo_product_rows
        if safe_int(row.get("product_id"), 0) > 0
    }
    if not product_ids:
        return

    completed_sales, _ = build_sale_status_maps()
    sales_transactions = {safe_int(row.get("sales_id"), 0): row for row in fetch_rows("sales_transaction")}
    customer_lookup = build_customer_lookup()
    customer_ids = set()
    for detail in fetch_rows("sales_details"):
        if safe_int(detail.get("product_id"), 0) not in product_ids:
            continue
        sales_id = safe_int(detail.get("sales_id"), 0)
        if sales_id not in completed_sales:
            continue
        customer_id = safe_int(sales_transactions.get(sales_id, {}).get("customer_id"), 0)
        if customer_id > 0:
            customer_ids.add(customer_id)

    notification_payloads = []
    for customer_id in customer_ids:
        customer = customer_lookup.get(customer_id, {})
        notification_payloads.append(
            {
                "customer_id": customer_id,
                "promo_id": promo_id,
                "email": customer.get("email") or None,
                "email_status": "Pending",
                "date_sent": datetime.now().isoformat(),
            }
        )

    if notification_payloads:
        supabase.table("notification").insert(notification_payloads).execute()


def sync_promotion_products(
    promo_id,
    target_category_id=None,
    target_product_id=None,
    *,
    supabase,
    safe_int,
):
    supabase.table("promo_product").delete().eq("promo_id", promo_id).execute()

    product_query = supabase.table("product").select("product_id")
    if safe_int(target_product_id, 0) > 0:
        product_query = product_query.eq("product_id", safe_int(target_product_id, 0))
    elif target_category_id not in (None, "", "all"):
        product_query = product_query.eq("category_id", target_category_id)
    products = product_query.execute().data or []
    if not products:
        return 0

    supabase.table("promo_product").insert(
        [{"promo_id": promo_id, "product_id": row["product_id"]} for row in products]
    ).execute()
    return len(products)


def build_active_promotion_lookup(
    *,
    fetch_rows,
    parse_iso_datetime,
):
    promotions = fetch_rows("promotion")
    promo_products = fetch_rows("promo_product")
    now = datetime.now().date()

    active_promotions = {}
    for promo in promotions:
        status = str(promo.get("status", "")).lower()
        start_date = parse_iso_datetime(promo.get("start_date")) or datetime.min
        end_date = parse_iso_datetime(promo.get("end_date")) or datetime.max
        if status != "active":
            continue
        if not (start_date.date() <= now <= end_date.date()):
            continue
        active_promotions[promo["promo_id"]] = promo

    product_promotions = {}
    for row in promo_products:
        promo = active_promotions.get(row.get("promo_id"))
        product_id = row.get("product_id")
        if promo and product_id:
            product_promotions[product_id] = promo

    return product_promotions


def compute_promo_discount(base_price, promo, *, normalize_promotion_type, safe_float):
    if not promo or base_price <= 0:
        return 0

    discount_type = normalize_promotion_type(promo.get("discount_type", ""))
    discount_value = safe_float(promo.get("discount_value"), 0)

    if discount_type == "percentage":
        return base_price * (discount_value / 100)
    if discount_type == "fixed":
        return discount_value
    return 0


def build_promotions_context(
    *,
    fetch_rows,
    build_product_lookup,
    safe_float,
    safe_int,
    normalize_promotion_type,
    format_promotion_type,
    format_promotion_discount,
    format_short_date,
    build_chart_points,
):
    promotions = fetch_rows("promotion")
    promo_products = fetch_rows("promo_product")
    products = build_product_lookup()
    analytics = {row.get("product_id"): row for row in fetch_rows("sales_analytics")}

    products_by_promo = {}
    for row in promo_products:
        products_by_promo.setdefault(row.get("promo_id"), []).append(row.get("product_id"))

    category_sales = defaultdict(float)
    discount_bands = {
        "10-20%": {"sales": 0, "units": 0, "campaigns": 0},
        "20-30%": {"sales": 0, "units": 0, "campaigns": 0},
        "30-40%": {"sales": 0, "units": 0, "campaigns": 0},
        "40-50%": {"sales": 0, "units": 0, "campaigns": 0},
    }
    campaign_rows = []
    total_revenue = 0
    total_units = 0
    active_count = 0

    for promo in promotions:
        promo_id = promo.get("promo_id")
        product_ids = products_by_promo.get(promo_id, [])
        linked_products = [products.get(product_id, {}) for product_id in product_ids if products.get(product_id)]
        product_names = [item.get("product_name", "Unknown Product") for item in linked_products]
        categories = [item.get("category", "General") for item in linked_products if item.get("category")]
        unique_categories = list(dict.fromkeys(categories))
        unique_category_ids = list(
            dict.fromkeys(
                item.get("category_id")
                for item in linked_products
                if item.get("category_id") is not None
            )
        )
        unique_product_names = list(dict.fromkeys(product_names))
        revenue = sum(safe_float(analytics.get(product_id, {}).get("total_sales"), 0) for product_id in product_ids)
        units = sum(
            safe_int(analytics.get(product_id, {}).get("total_quantity_sold"), 0)
            for product_id in product_ids
        )
        effectiveness = min(100, 60 + units * 8)
        status = str(promo.get("status", "inactive")).title()
        if status == "Active":
            active_count += 1
        total_revenue += revenue
        total_units += units

        for product_id in product_ids:
            category = products.get(product_id, {}).get("category", "General")
            category_sales[category] += safe_float(analytics.get(product_id, {}).get("total_sales"), 0)

        discount_value = safe_float(promo.get("discount_value"), 0)
        raw_discount_type = str(promo.get("discount_type", "")).strip().lower()
        discount_type = normalize_promotion_type(raw_discount_type)
        type_label, type_detail_label = format_promotion_type(raw_discount_type)
        discount_display = format_promotion_discount(raw_discount_type, promo.get("discount_value"))
        effective_percent = discount_value if discount_type == "percentage" else min(discount_value / 10, 35)
        if effective_percent <= 20:
            band_key = "10-20%"
        elif effective_percent <= 30:
            band_key = "20-30%"
        elif effective_percent <= 40:
            band_key = "30-40%"
        else:
            band_key = "40-50%"
        discount_bands[band_key]["sales"] += revenue
        discount_bands[band_key]["units"] += units
        discount_bands[band_key]["campaigns"] += 1

        target_label = "All Products"
        if len(unique_categories) == 1 and unique_categories[0] != "General":
            target_label = f"{unique_categories[0]} Category"
        elif len(unique_product_names) == 1:
            target_label = unique_product_names[0]
        elif unique_product_names:
            remaining_products = len(unique_product_names) - 2
            target_label = ", ".join(unique_product_names[:2])
            if remaining_products > 0:
                target_label = f"{target_label} +{remaining_products} more"

        base_name = str(promo.get("promo_name", "Promotion")).strip() or "Promotion"
        display_name = base_name
        if target_label != "All Products" and target_label.lower() not in base_name.lower():
            suffix = unique_product_names[0] if unique_product_names else target_label.replace(" Category", "")
            display_name = f"{base_name} - {suffix}"

        campaign_rows.append(
            {
                "promo_id": promo_id,
                "promo_name": base_name,
                "display_name": display_name,
                "target_label": target_label,
                "target_products": ", ".join(unique_product_names) if unique_product_names else "All Products",
                "target_category_id": unique_category_ids[0] if len(unique_category_ids) == 1 else "all",
                "discount_type_raw": discount_type,
                "start_date": str(promo.get("start_date", ""))[:10],
                "end_date": str(promo.get("end_date", ""))[:10],
                "status_raw": str(promo.get("status", "inactive")).lower(),
                "type": type_label,
                "type_detail": type_detail_label,
                "discount": promo.get("discount_value", 0),
                "discount_display": discount_display,
                "period": f"{promo.get('start_date', '')} to {promo.get('end_date', '')}",
                "start_date_display": format_short_date(promo.get("start_date")),
                "end_date_display": format_short_date(promo.get("end_date")),
                "status": status,
                "sales": revenue,
                "units": units,
                "effectiveness": effectiveness,
            }
        )

    average_effectiveness = (
        sum(row["effectiveness"] for row in campaign_rows) / len(campaign_rows) if campaign_rows else 0
    )
    promotion_chart = build_chart_points(campaign_rows, "promo_name", "sales")
    category_impact = build_chart_points(
        [{"category": category, "sales": sales} for category, sales in category_sales.items()],
        "category",
        "sales",
        min_height=24,
        max_height=100,
    )
    discount_effectiveness = build_chart_points(
        [
            {
                "band": band,
                "sales": values["sales"],
                "units": values["units"],
                "campaigns": values["campaigns"],
            }
            for band, values in discount_bands.items()
        ],
        "band",
        "sales",
    )

    max_revenue = max((row["sales"] for row in campaign_rows), default=0)
    max_roi = max((row["effectiveness"] for row in campaign_rows), default=0)
    promotion_comparison = []
    for row in campaign_rows[:4]:
        revenue_ratio = row["sales"] / max_revenue if max_revenue else 0
        roi_ratio = row["effectiveness"] / max_roi if max_roi else 0
        promotion_comparison.append(
            {
                "label": row["promo_name"],
                "revenue": row["sales"],
                "roi": row["effectiveness"],
                "revenue_height": 24 + revenue_ratio * 150,
                "roi_height": 24 + roi_ratio * 150,
            }
        )

    unit_peak = max((entry.get("units", 0) for entry in discount_effectiveness), default=0)
    for item in discount_effectiveness:
        item["sales_height"] = 24 + (item["ratio"] / 100) * 190
        unit_ratio = (item.get("units", 0) / unit_peak) if unit_peak else 0
        item["conversion_height"] = 24 + unit_ratio * 190

    sales_tick_peak = max((item.get("value", 0) for item in discount_effectiveness), default=0)
    if sales_tick_peak <= 0:
        discount_ticks = [0, 0, 0, 0, 0]
    else:
        discount_ticks = [round(sales_tick_peak * ratio) for ratio in (1, 0.75, 0.5, 0.25, 0)]

    total_category_sales = sum(item["value"] for item in category_impact) or 1
    pie_palette = ["cream", "gold", "soft", "pale"]
    category_distribution = []
    for index, item in enumerate(category_impact[:4]):
        percent = round((item["value"] / total_category_sales) * 100)
        category_distribution.append(
            {
                "label": item["label"],
                "value": item["value"],
                "percent": percent,
                "tone": pie_palette[index % len(pie_palette)],
            }
        )

    return (
        campaign_rows,
        active_count,
        total_revenue,
        total_units,
        average_effectiveness,
        promotion_chart,
        category_impact,
        discount_effectiveness,
        discount_ticks,
        promotion_comparison,
        category_distribution,
    )
