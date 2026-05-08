from datetime import datetime, timedelta
from collections import defaultdict


def build_inventory_turnover_context(
    *,
    fetch_rows,
    build_product_lookup,
    safe_int,
    safe_float,
):
    """
    Build comprehensive inventory analytics context for the 30-day turnover dashboard.

    Calculates:
    - Turnover ratio (units_sold / avg_inventory) for each product
    - Inventory velocity classification (high/medium/low/dead)
    - Days of stock remaining
    - High-velocity and slow-moving products
    - Dead stock identification (no sales in 60+ days)
    """
    products = build_product_lookup()
    sales_details_rows = fetch_rows("sales_details")
    inventory_rows = fetch_rows("inventory")
    inventory_log_rows = fetch_rows("inventory_log")

    # Build inventory lookup
    inventory_by_product = {}
    for inv_row in inventory_rows:
        product_id = safe_int(inv_row.get("product_id"), 0)
        if product_id > 0:
            inventory_by_product[product_id] = {
                "stock_quantity": safe_int(inv_row.get("stock_quantity"), 0),
                "reorder_level": safe_int(inv_row.get("reorder_level"), 10),
            }

    today = datetime.now().date()
    thirty_days_ago = today - timedelta(days=30)
    sixty_days_ago = today - timedelta(days=60)

    def parse_iso_datetime(date_string):
        """Parse ISO datetime string safely."""
        try:
            if not date_string:
                return None
            if isinstance(date_string, str):
                # Try full datetime format
                try:
                    return datetime.fromisoformat(date_string.replace('Z', '+00:00'))
                except:
                    # Try date only format
                    return datetime.strptime(date_string[:10], "%Y-%m-%d")
            return date_string
        except:
            return None

    # Calculate metrics per product (30-day window)
    product_metrics = {}
    for product_id, product in products.items():
        units_sold = 0
        total_sales_amount = 0
        last_sale_date = None
        sales_dates = []

        for detail in sales_details_rows:
            detail_product_id = safe_int(detail.get("product_id"), 0)
            if detail_product_id != product_id:
                continue

            sale_date_obj = parse_iso_datetime(detail.get("created_at"))
            if not sale_date_obj:
                continue

            sale_date = sale_date_obj.date()

            # Track all sales (for last sale date)
            if last_sale_date is None or sale_date > last_sale_date:
                last_sale_date = sale_date

            # Only count last 30 days for turnover calculation
            if sale_date >= thirty_days_ago:
                quantity = safe_int(detail.get("quantity"), 0)
                price = safe_float(detail.get("price"), 0)
                units_sold += quantity
                total_sales_amount += quantity * price
                sales_dates.append(sale_date)

        # Current inventory
        current_inventory = inventory_by_product.get(product_id, {})
        stock_quantity = current_inventory.get("stock_quantity", 0)
        reorder_level = current_inventory.get("reorder_level", 10)

        # Calculate average daily sales in last 30 days
        avg_daily_sales = units_sold / 30 if units_sold > 0 else 0

        # Turnover ratio = units_sold / average_inventory
        # For simplicity: use current stock as proxy for average (could be improved with inventory_log)
        avg_inventory = max(stock_quantity, 1)  # Avoid division by zero
        turnover_ratio = units_sold / avg_inventory if avg_inventory > 0 else 0

        # Days of stock remaining
        days_of_stock = stock_quantity / avg_daily_sales if avg_daily_sales > 0 else 0

        # Classify velocity
        if units_sold == 0 and (last_sale_date is None or today - last_sale_date >= timedelta(days=60)):
            velocity_class = "dead_stock"
            velocity_label = "Dead Stock"
            velocity_tone = "danger"
        elif turnover_ratio >= 3:
            velocity_class = "high_velocity"
            velocity_label = "High Velocity"
            velocity_tone = "success"
        elif turnover_ratio >= 1:
            velocity_class = "medium_velocity"
            velocity_label = "Medium Velocity"
            velocity_tone = "info"
        else:
            velocity_class = "slow_mover"
            velocity_label = "Slow Mover"
            velocity_tone = "warning"

        # Determine action needed
        action = None
        action_tone = None
        if velocity_class == "dead_stock":
            action = "Recommend Markdown"
            action_tone = "danger"
        elif velocity_class == "slow_mover":
            action = "Consider Promotion"
            action_tone = "warning"
        elif velocity_class == "high_velocity" and stock_quantity < reorder_level:
            action = "Reorder Soon"
            action_tone = "warning"

        product_metrics[product_id] = {
            "product_id": product_id,
            "product_name": product.get("product_name", "Unknown"),
            "category": product.get("category", "General"),
            "size": product.get("size", "-"),
            "cost_price": safe_float(product.get("cost_price"), 0),

            # Inventory metrics
            "current_stock": stock_quantity,
            "reorder_level": reorder_level,

            # Sales metrics (30-day)
            "units_sold_30d": units_sold,
            "total_sales_amount_30d": total_sales_amount,
            "avg_daily_sales": round(avg_daily_sales, 2),

            # Turnover metrics
            "turnover_ratio": round(turnover_ratio, 2),
            "days_of_stock": round(days_of_stock, 1),
            "last_sale_date": last_sale_date.strftime("%Y-%m-%d") if last_sale_date else "Never",

            # Classification
            "velocity_class": velocity_class,
            "velocity_label": velocity_label,
            "velocity_tone": velocity_tone,
            "action": action,
            "action_tone": action_tone,
        }

    # Categorize products
    all_products = sorted(
        product_metrics.values(),
        key=lambda x: x["turnover_ratio"],
        reverse=True
    )

    high_velocity_products = [p for p in all_products if p["velocity_class"] == "high_velocity"]
    medium_velocity_products = [p for p in all_products if p["velocity_class"] == "medium_velocity"]
    slow_moving_products = [p for p in all_products if p["velocity_class"] == "slow_mover"]
    dead_stock_products = [p for p in all_products if p["velocity_class"] == "dead_stock"]

    # Category breakdown
    category_metrics = defaultdict(lambda: {
        "total_units": 0,
        "total_sales": 0,
        "product_count": 0,
        "avg_turnover": 0,
        "products": [],
    })

    for product in all_products:
        category = product["category"]
        category_metrics[category]["total_units"] += product["units_sold_30d"]
        category_metrics[category]["total_sales"] += product["total_sales_amount_30d"]
        category_metrics[category]["product_count"] += 1
        category_metrics[category]["products"].append(product)

    # Calculate average turnover per category
    for category, metrics in category_metrics.items():
        if metrics["product_count"] > 0:
            avg_turnover = sum(p["turnover_ratio"] for p in metrics["products"]) / metrics["product_count"]
            metrics["avg_turnover"] = round(avg_turnover, 2)

    category_breakdown = sorted(
        [
            {
                "name": category,
                "total_units": metrics["total_units"],
                "total_sales": round(metrics["total_sales"], 2),
                "product_count": metrics["product_count"],
                "avg_turnover": metrics["avg_turnover"],
            }
            for category, metrics in category_metrics.items()
        ],
        key=lambda x: x["total_units"],
        reverse=True
    )

    # Summary stats
    total_products = len(all_products)
    total_dead_stock = len(dead_stock_products)
    total_slow_movers = len(slow_moving_products)
    products_needing_action = len([p for p in all_products if p["action"]])

    avg_turnover_ratio = sum(p["turnover_ratio"] for p in all_products) / total_products if total_products > 0 else 0
    best_turnover_product = max(all_products, key=lambda x: x["turnover_ratio"]) if all_products else None

    return {
        "all_products": all_products,
        "high_velocity_products": high_velocity_products,
        "medium_velocity_products": medium_velocity_products,
        "slow_moving_products": slow_moving_products,
        "dead_stock_products": dead_stock_products,
        "category_breakdown": category_breakdown,

        # Summary stats
        "total_products": total_products,
        "total_dead_stock": total_dead_stock,
        "total_slow_movers": total_slow_movers,
        "products_needing_action": products_needing_action,
        "avg_turnover_ratio": round(avg_turnover_ratio, 2),
        "best_turnover_product": best_turnover_product,

        # Metadata
        "report_date": today.strftime("%B %d, %Y"),
        "analysis_period": "Last 30 Days",
    }
