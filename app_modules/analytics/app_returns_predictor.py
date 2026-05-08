from datetime import datetime, timedelta
from collections import defaultdict


def build_returns_analysis_context(
    *,
    fetch_rows,
    build_product_lookup,
    safe_int,
    safe_float,
):
    """
    Build returns analysis context for identifying high-risk products and customers.

    Analyzes:
    - Return rate by product (>10% flagged as high-risk)
    - Return reasons distribution
    - Customer return frequency and patterns
    - Product return trends
    - Recommendations for improvement
    """
    products = build_product_lookup()
    sales_details_rows = fetch_rows("sales_details")
    returns_rows = fetch_rows("returns")
    return_details_rows = fetch_rows("return_details")
    customers_rows = fetch_rows("customer")

    today = datetime.now().date()
    return_risk_threshold = 0.10  # 10% return rate

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

    # Build customer lookup
    customers_by_id = {}
    for cust in customers_rows:
        cust_id = cust.get("customer_id")
        if cust_id:
            customers_by_id[cust_id] = {
                "name": cust.get("name", "Unknown"),
                "email": cust.get("email", ""),
            }

    # Build returns lookup
    returns_by_id = {}
    for ret in returns_rows:
        ret_id = ret.get("return_id")
        if ret_id:
            returns_by_id[ret_id] = ret

    # Count total sales per product (all time)
    product_total_sales = defaultdict(int)
    for detail in sales_details_rows:
        product_id = safe_int(detail.get("product_id"), 0)
        if product_id > 0:
            quantity = safe_int(detail.get("quantity"), 0)
            product_total_sales[product_id] += quantity

    # Analyze returns per product
    product_returns = defaultdict(lambda: {
        "total_returned": 0,
        "return_count": 0,
        "reasons": defaultdict(int),
        "return_dates": [],
    })

    customer_returns = defaultdict(lambda: {
        "return_count": 0,
        "products_returned": set(),
        "return_dates": [],
        "total_refund": 0,
    })

    for ret_detail in return_details_rows:
        product_id = safe_int(ret_detail.get("product_id"), 0)
        if product_id <= 0:
            continue

        return_id = ret_detail.get("return_id")
        quantity_returned = safe_int(ret_detail.get("quantity_returned"), 0)
        reason = (ret_detail.get("reason") or "Not specified").strip()

        ret_info = returns_by_id.get(return_id, {})
        customer_id = ret_info.get("customer_id")
        return_date_obj = parse_iso_datetime(ret_info.get("return_date"))
        return_date = return_date_obj.date() if return_date_obj else today

        # Product returns
        product_returns[product_id]["total_returned"] += quantity_returned
        product_returns[product_id]["return_count"] += 1
        product_returns[product_id]["reasons"][reason] += 1
        product_returns[product_id]["return_dates"].append(return_date)

        # Customer returns
        if customer_id:
            customer_returns[customer_id]["return_count"] += 1
            customer_returns[customer_id]["products_returned"].add(product_id)
            customer_returns[customer_id]["return_dates"].append(return_date)
            customer_returns[customer_id]["total_refund"] += safe_float(ret_detail.get("refund_amount"), 0)

    # Build product return metrics
    product_metrics = {}
    for product_id, product in products.items():
        total_sold = product_total_sales.get(product_id, 0)
        returns_info = product_returns.get(product_id, {})
        total_returned = returns_info["total_returned"]

        # Calculate return rate
        return_rate = total_returned / total_sold if total_sold > 0 else 0

        # Classify risk
        if return_rate > return_risk_threshold:
            risk_level = "high"
            risk_tone = "danger"
        elif return_rate > 0.05:
            risk_level = "medium"
            risk_tone = "warning"
        else:
            risk_level = "low"
            risk_tone = "success"

        # Get top return reasons
        reasons_dict = returns_info.get("reasons", {})
        top_reasons = sorted(
            reasons_dict.items(),
            key=lambda x: x[1],
            reverse=True
        )[:3]

        # Last return date
        return_dates = returns_info["return_dates"]
        last_return_date = max(return_dates) if return_dates else None

        # Recent returns (last 30 days)
        thirty_days_ago = today - timedelta(days=30)
        recent_returns = sum(1 for d in return_dates if d >= thirty_days_ago)

        # Recommendations
        recommendations = []
        if return_rate > return_risk_threshold:
            recommendations.append({
                "action": "Improve Product Description",
                "reason": "High return rate may indicate customer confusion",
                "priority": "high",
            })
            if any("fit" in str(reason).lower() or "size" in str(reason).lower() for reason, _ in top_reasons):
                recommendations.append({
                    "action": "Add Size/Fit Guide",
                    "reason": "Common return reason is fit or sizing issue",
                    "priority": "high",
                })
            if return_rate > 0.15:
                recommendations.append({
                    "action": "Consider Pricing/Markdown",
                    "reason": "Very high return rate suggests demand/value issue",
                    "priority": "medium",
                })

        product_metrics[product_id] = {
            "product_id": product_id,
            "product_name": product.get("product_name", "Unknown"),
            "category": product.get("category", "General"),
            "size": product.get("size", "-"),

            # Sales and return metrics
            "total_sold": total_sold,
            "total_returned": total_returned,
            "return_rate": round(return_rate * 100, 2),
            "return_count": returns_info["return_count"],

            # Risk classification
            "risk_level": risk_level,
            "risk_tone": risk_tone,

            # Return reasons
            "top_reasons": [{"reason": reason, "count": count} for reason, count in top_reasons],
            "all_reasons": [{"reason": reason, "count": count} for reason, count in reasons_dict.items()],

            # Trends
            "last_return_date": last_return_date.strftime("%Y-%m-%d") if last_return_date else "Never",
            "recent_returns_30d": recent_returns,

            # Recommendations
            "recommendations": recommendations,
        }

    # Build customer return profiles
    customer_profiles = {}
    for customer_id, cust_returns in customer_returns.items():
        customer_info = customers_by_id.get(customer_id, {})
        return_count = cust_returns["return_count"]
        products_returned = len(cust_returns["products_returned"])
        return_dates = cust_returns["return_dates"]

        # Classify customer risk
        if return_count >= 3:
            customer_risk = "high"
            customer_risk_tone = "danger"
        elif return_count >= 2:
            customer_risk = "medium"
            customer_risk_tone = "warning"
        else:
            customer_risk = "low"
            customer_risk_tone = "success"

        # Recent activity
        thirty_days_ago = today - timedelta(days=30)
        recent_returns_30d = sum(1 for d in return_dates if d >= thirty_days_ago)

        # Last return
        last_return = max(return_dates) if return_dates else None

        customer_profiles[customer_id] = {
            "customer_id": customer_id,
            "customer_name": customer_info.get("name", "Unknown"),
            "email": customer_info.get("email", "N/A"),

            # Return metrics
            "return_count": return_count,
            "products_returned": products_returned,
            "total_refund": round(cust_returns["total_refund"], 2),

            # Risk classification
            "risk_level": customer_risk,
            "risk_tone": customer_risk_tone,

            # Activity
            "last_return_date": last_return.strftime("%Y-%m-%d") if last_return else "Never",
            "recent_returns_30d": recent_returns_30d,
            "days_since_last_return": (today - last_return).days if last_return else None,
        }

    # Categorize products
    all_products_sorted = sorted(
        product_metrics.values(),
        key=lambda x: x["return_rate"],
        reverse=True
    )

    high_risk_products = [p for p in all_products_sorted if p["risk_level"] == "high"]
    medium_risk_products = [p for p in all_products_sorted if p["risk_level"] == "medium"]
    low_risk_products = [p for p in all_products_sorted if p["risk_level"] == "low"]

    # Categorize customers
    all_customers_sorted = sorted(
        customer_profiles.values(),
        key=lambda x: x["return_count"],
        reverse=True
    )

    high_risk_customers = [c for c in all_customers_sorted if c["risk_level"] == "high"]
    frequent_returners = [c for c in high_risk_customers if c["return_count"] >= 3]

    # Return reasons aggregation (all products)
    all_reasons = defaultdict(int)
    for product in product_metrics.values():
        for reason_item in product["all_reasons"]:
            all_reasons[reason_item["reason"]] += reason_item["count"]

    sorted_reasons = sorted(
        [{"reason": reason, "count": count} for reason, count in all_reasons.items()],
        key=lambda x: x["count"],
        reverse=True
    )

    # Category breakdown
    category_return_metrics = defaultdict(lambda: {
        "total_sold": 0,
        "total_returned": 0,
        "product_count": 0,
        "avg_return_rate": 0,
    })

    for product in all_products_sorted:
        category = product["category"]
        category_return_metrics[category]["total_sold"] += product["total_sold"]
        category_return_metrics[category]["total_returned"] += product["total_returned"]
        category_return_metrics[category]["product_count"] += 1

    for category, metrics in category_return_metrics.items():
        if metrics["total_sold"] > 0:
            metrics["avg_return_rate"] = round(
                (metrics["total_returned"] / metrics["total_sold"]) * 100, 2
            )

    category_breakdown = sorted(
        [
            {
                "name": category,
                "total_sold": metrics["total_sold"],
                "total_returned": metrics["total_returned"],
                "avg_return_rate": metrics["avg_return_rate"],
                "product_count": metrics["product_count"],
            }
            for category, metrics in category_return_metrics.items()
        ],
        key=lambda x: x["avg_return_rate"],
        reverse=True
    )

    # Summary stats
    total_products_analyzed = len(all_products_sorted)
    total_sold_all = sum(p["total_sold"] for p in all_products_sorted)
    total_returned_all = sum(p["total_returned"] for p in all_products_sorted)
    overall_return_rate = (total_returned_all / total_sold_all * 100) if total_sold_all > 0 else 0

    return {
        "products": all_products_sorted,
        "high_risk_products": high_risk_products,
        "medium_risk_products": medium_risk_products,
        "low_risk_products": low_risk_products,

        "customers": all_customers_sorted,
        "high_risk_customers": high_risk_customers,
        "frequent_returners": frequent_returners,

        "return_reasons": sorted_reasons,
        "category_breakdown": category_breakdown,

        # Summary stats
        "total_products": total_products_analyzed,
        "total_customers_with_returns": len(customer_profiles),
        "total_sold": total_sold_all,
        "total_returned": total_returned_all,
        "overall_return_rate": round(overall_return_rate, 2),
        "high_risk_product_count": len(high_risk_products),
        "frequent_returner_count": len(frequent_returners),

        # Metadata
        "report_date": today.strftime("%B %d, %Y"),
        "return_risk_threshold": f"{return_risk_threshold * 100:.0f}%",
    }
