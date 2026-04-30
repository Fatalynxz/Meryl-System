def build_dashboard_context(
    *,
    build_sales_rows,
    normalize_inventory_products,
    fetch_rows,
    safe_float,
    build_product_lookup,
    safe_int,
):
    sales_rows = build_sales_rows()
    inventory_products = normalize_inventory_products(fetch_rows("product"))
    customers_rows = fetch_rows("customers")
    analytics = sorted(
        fetch_rows("sales_analytics"),
        key=lambda item: safe_float(item.get("total_sales"), 0),
        reverse=True,
    )
    products = build_product_lookup()

    completed_sales_rows = [row for row in sales_rows if row.get("status") == "Completed"]
    revenue = sum(safe_float(row.get("amount"), 0) for row in completed_sales_rows)
    total_products = len(inventory_products)
    customers = len(customers_rows)
    low_stock = sum(1 for product in inventory_products if safe_int(product.get("stock_quantity"), 0) <= 10)
    revenue_growth = 12
    customer_growth = max(1, min(customers, 4)) if customers else 0

    recent_sales = [
        {
            "customer_name": row.get("customer_name", "Walk-in Customer"),
            "product_name": row.get("product_name", "Mixed Items"),
            "total_amount": safe_float(row.get("amount"), 0),
            "date": row.get("date", "N/A"),
            "status": row.get("status", "Pending"),
            "status_tone": row.get("status_tone", "warning"),
        }
        for row in sales_rows[:4]
    ]
    top_products = []
    for item in analytics[:4]:
        product = products.get(item.get("product_id"), {})
        top_products.append(
            {
                "product_name": product.get("product_name", "Unknown"),
                "total_quantity_sold": safe_int(item.get("total_quantity_sold"), 0),
                "total_sales": safe_float(item.get("total_sales"), 0),
                "sales_date": "Recent",
            }
        )

    return {
        "revenue": revenue,
        "revenue_growth": revenue_growth,
        "total_products": total_products,
        "customers": customers,
        "customer_growth": customer_growth,
        "low_stock": low_stock,
        "recent_sales": recent_sales,
        "top_products": top_products,
    }


def build_sales_page_context(*, build_sales_rows, datetime_cls, safe_float):
    sales_rows = build_sales_rows()
    today_string = datetime_cls.now().strftime("%Y-%m-%d")
    completed_sales_rows = [row for row in sales_rows if row.get("status") == "Completed"]
    total_revenue = sum(safe_float(row.get("amount"), 0) for row in completed_sales_rows)
    today_sales = sum(1 for row in completed_sales_rows if row.get("date") == today_string)
    pending_orders = sum(1 for row in sales_rows if row.get("status") == "Pending")
    return {
        "sales_rows": sales_rows,
        "total_revenue": total_revenue,
        "today_sales": today_sales,
        "pending_orders": pending_orders,
    }


def build_customers_page_context(*, build_customer_rows, safe_int):
    customer_rows = build_customer_rows()
    active_customers = sum(1 for row in customer_rows if row.get("status") == "Active")
    total_loyalty_points = sum(safe_int(row.get("loyalty_points"), 0) for row in customer_rows)
    top_customer = max(customer_rows, key=lambda row: safe_int(row.get("purchases"), 0), default=None)
    return {
        "customer_rows": customer_rows,
        "active_customers": active_customers,
        "total_loyalty_points": total_loyalty_points,
        "top_customer": top_customer,
    }


def build_staff_accounts_page_context(*, ensure_core_role_accounts, build_staff_rows, generate_staff_code, load_auth_accounts):
    ensure_core_role_accounts()
    staff_rows = build_staff_rows()
    return {
        "staff_rows": staff_rows,
        "staff_count": len(staff_rows),
        "sales_staff_count": sum(1 for row in staff_rows if row.get("role") == "sales_staff"),
        "inventory_staff_count": sum(1 for row in staff_rows if row.get("role") == "inventory_staff"),
        "next_staff_code": generate_staff_code(load_auth_accounts()),
    }


def build_inventory_page_context(
    *,
    normalize_inventory_products,
    fetch_rows,
    build_filter_options,
    safe_int,
    build_category_options,
):
    inventory_products = normalize_inventory_products(fetch_rows("product"))
    filter_options = build_filter_options(inventory_products)
    return {
        "inventory_products": inventory_products,
        "total_products": len(inventory_products),
        "low_stock_count": sum(1 for product in inventory_products if safe_int(product.get("stock_quantity"), 0) <= 10),
        "filter_brands": filter_options["brands"],
        "filter_sizes": filter_options["sizes"],
        "category_options": build_category_options(),
    }


def build_reports_page_context(*, build_reports_context):
    (
        revenue_points,
        revenue_chart,
        revenue_breakdown,
        daily_summary,
        weekly_summary,
        monthly_summary,
        total_revenue,
        units_sold,
        inventory_turnover,
        avg_days_to_sell,
        top_products,
        slow_moving_products,
        inventory_status_rows,
        customer_targets,
    ) = build_reports_context()
    return {
        "revenue_points": revenue_points,
        "revenue_chart": revenue_chart,
        "revenue_breakdown": revenue_breakdown,
        "daily_summary": daily_summary,
        "weekly_summary": weekly_summary,
        "monthly_summary": monthly_summary,
        "total_revenue": total_revenue,
        "units_sold": units_sold,
        "inventory_turnover": inventory_turnover,
        "avg_days_to_sell": avg_days_to_sell,
        "top_products": top_products,
        "slow_moving_products": slow_moving_products,
        "inventory_status_rows": inventory_status_rows,
        "customer_targets": customer_targets,
    }


def build_predictive_page_context(*, demand_range, forecast_range, build_predictive_context, safe_float, round_fn=round):
    (
        category_totals,
        category_chart,
        forecast_rows,
        fast_moving,
        slow_moving,
        restock_rows,
        chart_categories,
        sales_forecast,
        demand_range,
        forecast_range,
    ) = build_predictive_context(demand_range, forecast_range)
    predicted_next_month = safe_float(sales_forecast.get("next_month_prediction"), 0)
    return {
        "forecast_accuracy": round_fn(
            sum(sales_forecast.get("accuracy_values", [])) / max(len(sales_forecast.get("accuracy_values", [])), 1)
        ),
        "predicted_next_month": predicted_next_month,
        "items_need_restock": len(restock_rows),
        "inventory_turnover": round_fn((sum(item.get("sold", 0) for item in fast_moving) / max(len(fast_moving), 1)) / 10, 1),
        "category_totals": category_totals,
        "category_chart": category_chart,
        "forecast_rows": forecast_rows,
        "fast_moving": fast_moving,
        "slow_moving": slow_moving,
        "restock_rows": restock_rows,
        "chart_categories": chart_categories,
        "sales_forecast": sales_forecast,
        "demand_range": demand_range,
        "forecast_range": forecast_range,
    }


def build_sales_export_csv_content(*, build_sales_rows, format_currency):
    sales_rows = build_sales_rows()
    csv_lines = [
        "Order ID,Customer,Products,Quantity,Amount,Payment Method,Status,Reason,Date"
    ]
    for row in sales_rows:
        values = [
            row.get("order_id", ""),
            row.get("customer_name", ""),
            row.get("product_details", ""),
            str(row.get("quantity", "")),
            format_currency(row.get("amount", 0)),
            row.get("payment_method", ""),
            row.get("status", ""),
            row.get("reason", ""),
            row.get("date", ""),
        ]
        escaped = []
        for value in values:
            text = str(value or "")
            if any(token in text for token in [",", "\"", "\n"]):
                text = "\"" + text.replace("\"", "\"\"") + "\""
            escaped.append(text)
        csv_lines.append(",".join(escaped))
    return "\n".join(csv_lines)
