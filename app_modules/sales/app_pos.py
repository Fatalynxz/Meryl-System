def build_pos_catalog(products, *, build_product_group_key, safe_float, safe_int):
    catalog = {}
    for product in products:
        group_key = product.get("group_key") or build_product_group_key(product)
        entry = catalog.setdefault(
            group_key,
            {
                "group_key": group_key,
                "product_name": product.get("product_name", "Unknown Product"),
                "brand": product.get("brand", "Meryl"),
                "category": product.get("category", "General"),
                "base_price": safe_float(product.get("final_price", product.get("base_price")), 0),
                "promo_name": product.get("promo_name"),
                "stock_total": 0,
                "sizes": [],
            },
        )
        entry["stock_total"] += max(0, safe_int(product.get("stock_quantity"), 0))
        entry["base_price"] = (
            min(
                entry["base_price"],
                safe_float(product.get("final_price", product.get("base_price")), 0),
            )
            if entry["sizes"]
            else safe_float(product.get("final_price", product.get("base_price")), 0)
        )
        entry["promo_name"] = entry["promo_name"] or product.get("promo_name")
        entry["sizes"].append(
            {
                "product_id": product.get("product_id"),
                "size": str(product.get("size", "-")).strip() or "-",
                "stock_quantity": max(0, safe_int(product.get("stock_quantity"), 0)),
                "price": safe_float(product.get("final_price", product.get("base_price")), 0),
                "promo_name": product.get("promo_name"),
            }
        )

    product_groups = []
    for entry in catalog.values():
        entry["sizes"] = sorted(
            entry["sizes"],
            key=lambda item: safe_float(item.get("size"), 0)
            if str(item.get("size", "")).replace(".", "", 1).isdigit()
            else str(item.get("size", "")),
        )
        entry["size_labels"] = [item["size"] for item in entry["sizes"]]
        entry["size_count"] = len(entry["sizes"])
        product_groups.append(entry)

    return sorted(product_groups, key=lambda item: (item["product_name"], item["brand"], item["category"]))


def normalize_cart_items(cart, *, safe_float, safe_int):
    normalized = []
    for item in cart or []:
        price = safe_float(item.get("price"), 0)
        quantity = safe_int(item.get("quantity"), 0)
        discount_percent = safe_float(item.get("discount"), 0)
        subtotal = safe_float(item.get("subtotal"), 0)

        base_subtotal = safe_float(item.get("base_subtotal"), 0)
        if base_subtotal <= 0:
            base_subtotal = price * quantity

        discount_amount = safe_float(item.get("discount_amount"), 0)
        if discount_amount <= 0:
            computed_discount = max(base_subtotal - subtotal, 0)
            if computed_discount > 0:
                discount_amount = computed_discount
            else:
                discount_amount = base_subtotal * (discount_percent / 100)

        final_subtotal = subtotal if subtotal > 0 else max(base_subtotal - discount_amount, 0)

        normalized.append(
            {
                **item,
                "size": str(item.get("size", "-")).strip() or "-",
                "price": price,
                "quantity": quantity,
                "discount": discount_percent,
                "base_subtotal": base_subtotal,
                "discount_amount": discount_amount,
                "subtotal": final_subtotal,
            }
        )

    return normalized


def add_product_to_cart(
    cart,
    product,
    *,
    selected_size,
    qty,
    discount,
    safe_int,
    safe_float,
):
    base_price = safe_float(product["base_price"], 0)
    promo_discount_per_unit = safe_float(product.get("promo_discount"), 0)
    manual_discount_per_unit = base_price * (discount / 100)
    total_discount_per_unit = promo_discount_per_unit + manual_discount_per_unit
    base_subtotal = base_price * qty
    discount_amount = total_discount_per_unit * qty
    subtotal = max(base_subtotal - discount_amount, 0)

    existing_item = next(
        (
            item
            for item in cart
            if safe_int(item.get("product_id"), 0) == safe_int(product["product_id"], 0)
            and str(item.get("size", "")).strip() == selected_size
            and safe_float(item.get("discount"), 0) == discount
        ),
        None,
    )
    if existing_item:
        existing_item["quantity"] = safe_int(existing_item.get("quantity"), 0) + qty
        existing_item["base_subtotal"] = safe_float(existing_item.get("base_subtotal"), 0) + base_subtotal
        existing_item["discount_amount"] = safe_float(existing_item.get("discount_amount"), 0) + discount_amount
        existing_item["subtotal"] = safe_float(existing_item.get("subtotal"), 0) + subtotal
        existing_item["promo_discount"] = safe_float(existing_item.get("promo_discount"), 0) + (
            promo_discount_per_unit * qty
        )
    else:
        cart.append(
            {
                "product_id": product["product_id"],
                "product_name": product["product_name"],
                "size": selected_size,
                "quantity": qty,
                "price": base_price,
                "subtotal": subtotal,
                "base_subtotal": base_subtotal,
                "discount": discount,
                "discount_amount": discount_amount,
                "promo_name": product.get("promo_name"),
                "promo_discount": promo_discount_per_unit * qty,
            }
        )

    return cart


def build_pos_page_context(
    *,
    normalize_inventory_products,
    fetch_rows,
    build_pos_catalog,
    build_filter_options,
    normalize_cart_items,
    session_obj,
):
    products = normalize_inventory_products(fetch_rows("product"))
    product_groups = build_pos_catalog(products)
    filter_options = build_filter_options(products)
    customer_options = sorted(fetch_rows("customer"), key=lambda item: str(item.get("customer_name", "")).lower())
    cart = normalize_cart_items(session_obj.get("cart", []))
    session_obj["cart"] = cart
    receipt = session_obj.pop("receipt", None)

    subtotal = sum(float(item["base_subtotal"]) for item in cart)
    discount_total = sum(float(item["discount_amount"]) for item in cart)
    total = subtotal - discount_total
    cart_count = len(cart)
    total_units = sum(int(item["quantity"]) for item in cart)

    return {
        "products": products,
        "product_groups": product_groups,
        "customer_options": customer_options,
        "cart": cart,
        "subtotal": subtotal,
        "discount_total": discount_total,
        "total": total,
        "cart_count": cart_count,
        "total_units": total_units,
        "receipt": receipt,
        "brand_options": filter_options["brands"],
        "category_options": filter_options["categories"],
        "size_options": filter_options["sizes"],
    }


def remove_cart_item(cart, item_index):
    if 0 <= item_index < len(cart):
        removed_item = cart.pop(item_index)
        return cart, removed_item, None
    return cart, None, "Cart item not found."


def build_receipt_payload(
    *,
    sales_id,
    customer_name,
    cashier_name,
    payment_method,
    subtotal,
    discount_total,
    total,
    cash_received,
    change_amount,
    cart,
    receipt_timestamp,
):
    return {
        "receipt_number": f"RCP-{receipt_timestamp.strftime('%Y%m%d%H%M%S')}{sales_id}",
        "customer_name": customer_name,
        "cashier_name": cashier_name,
        "payment_method": payment_method.title(),
        "subtotal": subtotal,
        "discount_total": discount_total,
        "total": total,
        "cash_received": cash_received,
        "change_amount": change_amount,
        "status": "Pending",
        "items": cart,
        "date": receipt_timestamp.strftime("%m/%d/%Y, %I:%M:%S %p"),
    }


def get_receipt_from_session(session_obj):
    return session_obj.get("last_receipt") or session_obj.get("receipt")
