from datetime import datetime, timedelta
from collections import defaultdict


def build_pricing_context(
    *,
    fetch_rows,
    build_product_lookup,
    safe_int,
    safe_float,
):
    """
    Build dynamic pricing recommendations using maximize margin strategy.

    Analyzes:
    - Current price vs optimal price suggestions
    - Price elasticity from historical sales
    - Inventory levels and velocity
    - Category average prices
    - Margin impact analysis
    """
    products = build_product_lookup()
    sales_details_rows = fetch_rows("sales_details")
    inventory_rows = fetch_rows("inventory")

    today = datetime.now().date()
    thirty_days_ago = today - timedelta(days=30)

    # Minimum margin requirement
    min_margin_multiplier = 1.30  # 30% markup minimum

    def parse_iso_datetime(date_string):
        """Parse ISO datetime string safely."""
        try:
            if not date_string:
                return None
            if isinstance(date_string, str):
                try:
                    return datetime.fromisoformat(date_string.replace('Z', '+00:00'))
                except:
                    return datetime.strptime(date_string[:10], "%Y-%m-%d")
            return date_string
        except:
            return None

    # Build inventory lookup
    inventory_by_product = {}
    for inv_row in inventory_rows:
        product_id = safe_int(inv_row.get("product_id"), 0)
        if product_id > 0:
            inventory_by_product[product_id] = {
                "stock_quantity": safe_int(inv_row.get("stock_quantity"), 0),
                "reorder_level": safe_int(inv_row.get("reorder_level"), 10),
            }

    # Analyze sales by product
    product_sales_analysis = defaultdict(lambda: {
        "prices": [],
        "quantities": [],
        "amounts": [],
        "dates": [],
        "total_units": 0,
        "total_amount": 0,
        "unit_count": 0,
    })

    # Build category price statistics
    category_prices = defaultdict(list)

    for detail in sales_details_rows:
        product_id = safe_int(detail.get("product_id"), 0)
        if product_id <= 0:
            continue

        price = safe_float(detail.get("price"), 0)
        quantity = safe_int(detail.get("quantity"), 0)
        amount = safe_float(detail.get("subtotal"), 0)

        sale_date_obj = parse_iso_datetime(detail.get("created_at"))
        sale_date = sale_date_obj.date() if sale_date_obj else today

        # Track all prices
        product_sales_analysis[product_id]["prices"].append(price)
        product_sales_analysis[product_id]["quantities"].append(quantity)
        product_sales_analysis[product_id]["amounts"].append(amount)
        product_sales_analysis[product_id]["dates"].append(sale_date)
        product_sales_analysis[product_id]["total_units"] += quantity
        product_sales_analysis[product_id]["total_amount"] += amount
        product_sales_analysis[product_id]["unit_count"] += 1

        # Track by category for category averages
        if product_id in products:
            category = products[product_id].get("category", "General")
            category_prices[category].append(price)

    # Calculate category statistics
    category_stats = {}
    for category, prices in category_prices.items():
        if prices:
            avg_price = sum(prices) / len(prices)
            min_price = min(prices)
            max_price = max(prices)
            category_stats[category] = {
                "avg_price": round(avg_price, 2),
                "min_price": round(min_price, 2),
                "max_price": round(max_price, 2),
                "price_range": round(max_price - min_price, 2),
            }

    # Build pricing recommendations
    pricing_recommendations = {}

    for product_id, product in products.items():
        cost_price = safe_float(product.get("cost_price"), 0)
        category = product.get("category", "General")

        # Get current inventory
        current_inventory = inventory_by_product.get(product_id, {})
        stock_quantity = current_inventory.get("stock_quantity", 0)
        reorder_level = current_inventory.get("reorder_level", 10)

        # Sales analysis
        sales_info = product_sales_analysis.get(product_id, {})
        prices = sales_info.get("prices", [])
        quantities = sales_info.get("quantities", [])
        total_units = sales_info.get("total_units", 0)
        total_amount = sales_info.get("total_amount", 0)
        dates = sales_info.get("dates", [])

        # Get current price (last sale price)
        current_price = prices[-1] if prices else 0

        if current_price == 0:
            # No sales history, estimate from category
            category_stat = category_stats.get(category, {})
            current_price = category_stat.get("avg_price", cost_price * 1.5)

        # Calculate average sales in last 30 days
        recent_quantities = [
            q for q, d in zip(quantities, dates)
            if d >= thirty_days_ago
        ]
        units_sold_30d = sum(recent_quantities) if recent_quantities else 0
        avg_daily_sales = units_sold_30d / 30 if units_sold_30d > 0 else 0

        # Classify sales velocity
        if units_sold_30d >= 10:
            velocity_class = "high"
            velocity_multiplier = 1.08  # +8% for high velocity
        elif units_sold_30d >= 5:
            velocity_class = "medium"
            velocity_multiplier = 1.03  # +3% for medium velocity
        else:
            velocity_class = "low"
            velocity_multiplier = 1.01  # +1% for low velocity

        # Calculate days of stock remaining
        days_of_stock = stock_quantity / avg_daily_sales if avg_daily_sales > 0 else float('inf')

        # Determine inventory level classification
        if days_of_stock > 180:
            inventory_status = "excess"
            inventory_multiplier = 0.95  # Slight discount for excess
        elif days_of_stock > 90:
            inventory_status = "healthy"
            inventory_multiplier = 1.0  # No adjustment
        elif days_of_stock > 30:
            inventory_status = "good"
            inventory_multiplier = 1.02  # Slight premium
        else:
            inventory_status = "low"
            inventory_multiplier = 1.05  # More premium for low stock

        # Minimum allowable price
        minimum_price = cost_price * min_margin_multiplier

        # Category reference
        category_stat = category_stats.get(category, {})
        category_avg = category_stat.get("avg_price", cost_price * 1.5)

        # Calculate recommended price (Maximize Margin Strategy)
        if current_price < minimum_price:
            # Price is below minimum margin, recommend fixing it
            recommended_price = minimum_price * 1.05  # Add 5% buffer
            recommendation_reason = "Current price below minimum margin requirement"
        else:
            # Current price is healthy, optimize it
            base_recommendation = current_price * velocity_multiplier * inventory_multiplier
            recommended_price = max(base_recommendation, minimum_price)

            if velocity_class == "high" and inventory_status != "excess":
                recommendation_reason = "High velocity product - maintain/increase margin"
            elif inventory_status == "excess":
                recommendation_reason = "Excess inventory - holding margin for efficiency"
            else:
                recommendation_reason = "Standard pricing optimization"

        # Calculate margin metrics
        current_margin = ((current_price - cost_price) / current_price * 100) if current_price > 0 else 0
        recommended_margin = ((recommended_price - cost_price) / recommended_price * 100) if recommended_price > 0 else 0

        # Price change impact
        price_change_percentage = ((recommended_price - current_price) / current_price * 100) if current_price > 0 else 0

        # Estimated impact on revenue
        # Assume simple linear demand curve: each 1% price increase reduces demand by 0.5%
        demand_elasticity = 0.5
        estimated_quantity_change = units_sold_30d * (-price_change_percentage * demand_elasticity / 100)
        estimated_new_quantity = max(1, units_sold_30d + estimated_quantity_change)

        current_monthly_revenue = current_price * units_sold_30d
        estimated_new_revenue = recommended_price * estimated_new_quantity
        revenue_impact_percentage = ((estimated_new_revenue - current_monthly_revenue) / current_monthly_revenue * 100) if current_monthly_revenue > 0 else 0

        # Confidence score
        confidence_score = min(95, 50 + (len(prices) * 5))

        # Determine if recommendation should be applied
        should_apply = abs(price_change_percentage) >= 2  # Only if change is >= 2%

        pricing_recommendations[product_id] = {
            "product_id": product_id,
            "product_name": product.get("product_name", "Unknown"),
            "category": category,
            "size": product.get("size", "-"),
            "cost_price": round(cost_price, 2),

            # Current pricing
            "current_price": round(current_price, 2),
            "current_margin": round(current_margin, 2),
            "current_margin_percentage": round(current_margin, 1),

            # Recommended pricing
            "recommended_price": round(recommended_price, 2),
            "recommended_margin": round(recommended_margin, 2),
            "recommended_margin_percentage": round(recommended_margin, 1),
            "price_change_percentage": round(price_change_percentage, 2),
            "recommendation_reason": recommendation_reason,

            # Sales metrics
            "units_sold_30d": units_sold_30d,
            "avg_daily_sales": round(avg_daily_sales, 2),
            "total_units_all_time": total_units,

            # Inventory metrics
            "current_stock": stock_quantity,
            "days_of_stock": round(days_of_stock, 1) if days_of_stock != float('inf') else "∞",
            "inventory_status": inventory_status,

            # Velocity classification
            "velocity_class": velocity_class,

            # Category reference
            "category_avg_price": round(category_avg, 2),
            "category_min_price": category_stat.get("min_price", 0),
            "category_max_price": category_stat.get("max_price", 0),

            # Impact analysis
            "estimated_quantity_impact": round(estimated_quantity_change, 1),
            "estimated_new_quantity": round(estimated_new_quantity, 1),
            "current_monthly_revenue": round(current_monthly_revenue, 2),
            "estimated_new_revenue": round(estimated_new_revenue, 2),
            "revenue_impact_percentage": round(revenue_impact_percentage, 2),

            # Metadata
            "confidence_score": confidence_score,
            "should_apply": should_apply,
            "sales_history_count": len(prices),
        }

    # Sort by impact (highest positive impact first)
    all_recommendations = sorted(
        pricing_recommendations.values(),
        key=lambda x: x["revenue_impact_percentage"],
        reverse=True
    )

    # Categorize
    high_impact_products = [p for p in all_recommendations if p["revenue_impact_percentage"] >= 5]
    price_increase_products = [p for p in all_recommendations if p["price_change_percentage"] > 0 and p["should_apply"]]
    price_decrease_products = [p for p in all_recommendations if p["price_change_percentage"] < 0 and p["should_apply"]]
    margin_warning_products = [p for p in all_recommendations if p["current_margin_percentage"] < 30]

    # Summary statistics
    total_products = len(all_recommendations)
    products_with_recommendations = len([p for p in all_recommendations if p["should_apply"]])
    avg_current_margin = sum(p["current_margin_percentage"] for p in all_recommendations) / total_products if total_products > 0 else 0
    avg_recommended_margin = sum(p["recommended_margin_percentage"] for p in all_recommendations) / total_products if total_products > 0 else 0
    total_current_revenue_30d = sum(p["current_monthly_revenue"] for p in all_recommendations)
    total_estimated_revenue_30d = sum(p["estimated_new_revenue"] for p in all_recommendations)
    total_revenue_impact = total_estimated_revenue_30d - total_current_revenue_30d

    return {
        "all_products": all_recommendations,
        "high_impact_products": high_impact_products,
        "price_increase_products": price_increase_products,
        "price_decrease_products": price_decrease_products,
        "margin_warning_products": margin_warning_products,

        # Summary stats
        "total_products": total_products,
        "products_with_recommendations": products_with_recommendations,
        "avg_current_margin": round(avg_current_margin, 2),
        "avg_recommended_margin": round(avg_recommended_margin, 2),
        "total_current_revenue_30d": round(total_current_revenue_30d, 2),
        "total_estimated_revenue_30d": round(total_estimated_revenue_30d, 2),
        "total_revenue_impact": round(total_revenue_impact, 2),
        "total_revenue_impact_percentage": round(
            (total_revenue_impact / total_current_revenue_30d * 100) if total_current_revenue_30d > 0 else 0,
            2
        ),

        # Strategy
        "strategy": "maximize_margin",
        "min_margin_requirement": f"{(min_margin_multiplier - 1) * 100:.0f}%",

        # Metadata
        "report_date": today.strftime("%B %d, %Y"),
        "analysis_period": "Last 30 Days",
        "category_stats": category_stats,
    }
