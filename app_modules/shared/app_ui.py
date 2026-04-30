from datetime import datetime


def build_system_notifications(
    current_user=None,
    *,
    table_exists,
    fetch_raw_rows,
    build_customer_lookup,
    fetch_rows,
    parse_iso_datetime,
    safe_int,
):
    current_user = current_user or {}
    fallback = [
        {"title": "Daily sales report ready", "meta": "Revenue and unit trends updated."},
        {"title": "Low stock reminder", "meta": "Review products with limited quantity."},
        {"title": "Promotion check", "meta": "Active campaigns need follow-up today."},
        {"title": "Forecast refreshed", "meta": "Demand projections were recalculated."},
    ]
    if not table_exists("notification"):
        return fallback

    try:
        notifications = fetch_raw_rows("notification")
        if not notifications:
            return fallback

        customer_lookup = build_customer_lookup()
        promotion_lookup = {row.get("promo_id"): row for row in fetch_rows("promotion")}
        sorted_rows = sorted(
            notifications,
            key=lambda item: parse_iso_datetime(item.get("date_sent")) or datetime.min,
            reverse=True,
        )[:4]
        formatted = []
        for row in sorted_rows:
            customer = customer_lookup.get(safe_int(row.get("customer_id"), 0), {})
            promo = promotion_lookup.get(safe_int(row.get("promo_id"), 0), {})
            customer_name = customer.get("customer_name") or "Customer"
            promo_name = promo.get("promo_name") or "Promotion"
            email_status = str(row.get("email_status") or "Pending").strip()
            formatted.append(
                {
                    "title": f"{promo_name} for {customer_name}",
                    "meta": f"Email {email_status.lower()} to {row.get('email') or customer.get('email') or 'no email'}",
                }
            )
        return formatted or fallback
    except Exception:
        return fallback


def build_current_user_context(user, *, build_system_notifications):
    if not user:
        return None

    username = user.get("username", "admin")
    initials = "".join(part[:1] for part in user.get("name", "Administrator").split()[:2]).upper() or "AD"
    notifications = build_system_notifications(user)
    return {
        **user,
        "username": username,
        "initials": initials,
        "role_label": user.get("role", "admin").replace("_", " ").title(),
        "notifications": notifications,
        "notification_count": len(notifications),
    }


def build_navigation_items(user):
    role = user.get("role") if user else None

    if role == "sales_staff":
        return [
            {"href": "/", "label": "Dashboard"},
            {"href": "/pos", "label": "Point of Sale"},
            {"href": "/account/settings", "label": "Settings"},
        ]

    if role == "inventory_staff":
        return [
            {"href": "/", "label": "Dashboard"},
            {"href": "/inventory", "label": "Inventory"},
            {"href": "/reports", "label": "Reports"},
            {"href": "/account/settings", "label": "Settings"},
        ]

    return [
        {"href": "/", "label": "Dashboard"},
        {"href": "/pos", "label": "POS"},
        {"href": "/inventory", "label": "Inventory"},
        {"href": "/sales", "label": "Sales"},
        {"href": "/customers", "label": "Customers"},
        {"href": "/predictive", "label": "Predictive"},
        {"href": "/promotions", "label": "Promotions"},
        {"href": "/staff", "label": "Users"},
        {"href": "/reports", "label": "Reports"},
    ]


def build_render_context(*, pop_notice, get_current_user, get_navigation_items, extra_context=None):
    extra_context = extra_context or {}
    return {
        "notice": pop_notice(),
        "current_user": get_current_user(),
        "nav_items": get_navigation_items(),
        **extra_context,
    }


def get_post_login_redirect(role):
    if role == "inventory_staff":
        return "/inventory"
    if role == "admin":
        return "/"
    return "/pos"


def get_account_settings_fallback_redirect(role):
    return "/pos" if role == "sales_staff" else "/inventory"


def build_login_form_data(form):
    return {
        "username": str(form.get("username") or "").strip(),
        "password": form.get("password") or "",
    }


def build_session_user_payload(user):
    user = user or {}
    return {
        "name": user.get("name", "Staff User"),
        "username": user.get("username", ""),
        "role": user.get("role", "sales_staff"),
        "email": user.get("email"),
        "staff_code": user.get("staff_code"),
        "status": user.get("status", "active"),
    }


def build_admin_login_payload(admin_credentials):
    return {
        "name": admin_credentials["name"],
        "username": admin_credentials["username"],
        "role": admin_credentials["role"],
    }


def build_staff_login_payload(account):
    account = account or {}
    return {
        "name": account.get("name", "Staff User"),
        "username": account.get("username", ""),
        "role": account.get("role", "sales_staff"),
        "email": account.get("email"),
        "staff_code": account.get("staff_code"),
        "status": account.get("status", "active"),
    }


def get_missing_account_notice():
    return "Account details were not found. Please contact the administrator."


def get_missing_account_redirect(role, *, for_save=False):
    if for_save:
        return "/login"
    return get_account_settings_fallback_redirect(role)


def get_logout_notice():
    return "You have been logged out."


def get_logout_redirect():
    return "/login"


def get_login_required_notice():
    return "Please log in to continue."


def get_access_denied_notice():
    return "You do not have access to that page."


def get_invalid_login_notice():
    return "Invalid login credentials."
