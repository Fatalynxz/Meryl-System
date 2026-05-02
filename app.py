from collections import defaultdict
from datetime import datetime, timedelta
from functools import wraps
import logging
import math
import os
import random
import smtplib
from email.message import EmailMessage
from pathlib import Path
import re

from dotenv import load_dotenv
from flask import Flask, Response, redirect, render_template, request, session, url_for, g
from supabase import create_client
from app_modules.auth.app_auth_store import (
    find_auth_account as store_find_auth_account,
    generate_staff_code as store_generate_staff_code,
    hash_password as store_hash_password,
    load_auth_accounts as store_load_auth_accounts,
    save_auth_accounts as store_save_auth_accounts,
)
from app_modules.shared.app_helpers import (
    APP_ROLE_TO_DB_ROLE_NAME,
    DEFAULT_CATEGORY_NAMES,
    STAFF_ROLES,
    canonical_app_role_name,
    db_payment_method,
    db_payment_status,
    db_product_status,
    db_promotion_status,
    db_promotion_type,
    db_user_status,
    format_currency,
    format_promotion_discount,
    format_promotion_type,
    format_role_label,
    format_short_date,
    normalize_account_status,
    normalize_promotion_type,
    normalize_staff_role,
    parse_iso_datetime,
    safe_float,
    safe_int,
    slugify_text,
)
from app_modules.shared.app_customers import (
    build_customer_form_data as customer_build_form_data,
    build_customer_lookup as customer_build_lookup,
    build_customer_rows as customer_build_rows,
    delete_customer_record as customer_delete_record,
    get_or_create_customer as customer_get_or_create,
)
from app_modules.shared.app_pages import (
    build_customers_page_context as page_build_customers_context,
    build_dashboard_context as page_build_dashboard_context,
    build_inventory_page_context as page_build_inventory_context,
    build_predictive_page_context as page_build_predictive_context,
    build_reports_page_context as page_build_reports_context,
    build_sales_export_csv_content as page_build_sales_export_csv_content,
    build_sales_page_context as page_build_sales_context,
    build_staff_accounts_page_context as page_build_staff_accounts_context,
)
from app_modules.inventory.app_inventory import (
    build_category_lookup as inventory_build_category_lookup,
    build_category_options as inventory_build_category_options,
    build_filter_options as inventory_build_filter_options,
    build_inventory_form_data as inventory_build_form_data,
    build_inventory_log_payload as inventory_build_log_payload,
    build_price_lookup as inventory_build_price_lookup,
    build_product_group_key as inventory_build_product_group_key,
    build_product_lookup as inventory_build_product_lookup,
    build_product_sku as inventory_build_product_sku,
    build_stock_lookup as inventory_build_stock_lookup,
    get_inventory_row as inventory_get_row,
    get_reorder_level as inventory_get_reorder_level,
    normalize_inventory_products as inventory_normalize_products,
    upsert_inventory_record as inventory_upsert_record,
)
from app_modules.inventory.app_inventory_flow import (
    complete_sale_inventory as inventory_flow_complete_sale,
    delete_inventory_product as inventory_flow_delete_product,
)
from app_modules.sales.app_sales import (
    build_chart_points as sales_build_chart_points,
    build_sale_status_maps as sales_build_status_maps,
    build_sales_rows as sales_build_rows,
    sync_sales_summary_entry as sales_sync_summary_entry,
)
from app_modules.sales.app_sales_flow import (
    deny_sale_transaction as sales_flow_deny_transaction,
)
from app_modules.analytics.app_promotions import (
    build_active_promotion_lookup as promotion_build_active_lookup,
    build_promotions_context as promotion_build_context,
    compute_promo_discount as promotion_compute_discount,
    sync_promotion_notifications as promotion_sync_notifications,
    sync_promotion_products as promotion_sync_products,
)
from app_modules.analytics.app_predictive import (
    build_predictive_context as predictive_build_context,
    build_reports_context as predictive_build_reports_context,
)
from app_modules.sales.app_pos import (
    add_product_to_cart as pos_add_product_to_cart,
    build_receipt_payload as pos_build_receipt_payload,
    build_pos_page_context as pos_build_page_context,
    build_pos_catalog as pos_build_catalog,
    get_receipt_from_session as pos_get_receipt_from_session,
    normalize_cart_items as pos_normalize_cart_items,
    remove_cart_item as pos_remove_cart_item,
)
from app_modules.sales.app_sync import (
    format_prediction_period_label as sync_format_prediction_period_label,
    sync_prediction_results as sync_prediction_results_helper,
    sync_sales_analytics_entry as sync_sales_analytics_entry_helper,
)
from app_modules.sales.app_forecast import (
    blended_recent_forecast as forecast_blended_recent,
    build_demand_range_buckets as forecast_build_demand_buckets,
    build_forecast_periods as forecast_build_periods,
    linear_regression_forecast as forecast_linear_regression,
    moving_average_forecast as forecast_moving_average,
    weighted_moving_average_forecast as forecast_weighted_moving_average,
)
from app_modules.shared.app_ui import (
    build_admin_login_payload as ui_build_admin_login_payload,
    build_current_user_context as ui_build_current_user_context,
    build_login_form_data as ui_build_login_form_data,
    build_navigation_items as ui_build_navigation_items,
    build_render_context as ui_build_render_context,
    build_session_user_payload as ui_build_session_user_payload,
    build_staff_login_payload as ui_build_staff_login_payload,
    build_system_notifications as ui_build_system_notifications,
    get_access_denied_notice as ui_get_access_denied_notice,
    get_invalid_login_notice as ui_get_invalid_login_notice,
    get_login_required_notice as ui_get_login_required_notice,
    get_logout_notice as ui_get_logout_notice,
    get_logout_redirect as ui_get_logout_redirect,
    get_missing_account_notice as ui_get_missing_account_notice,
    get_missing_account_redirect as ui_get_missing_account_redirect,
    get_account_settings_fallback_redirect as ui_get_account_settings_fallback_redirect,
    get_post_login_redirect as ui_get_post_login_redirect,
)
from app_modules.auth.app_staff import (
    build_staff_form_data as staff_build_form_data,
    build_staff_rows as staff_build_rows,
    get_protected_staff_notice as staff_get_protected_notice,
    is_protected_staff_account as staff_is_protected_account,
    sync_staff_user_record as staff_sync_user_record,
    upsert_staff_account as staff_upsert_account,
)

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = "secret123"

# Supabase initialization (lazy-loaded)
_supabase_client = None
_supabase_error = None


def get_supabase():
    """
    Lazy-load and return the Supabase client.
    Raises an exception if credentials are missing or connection fails.
    """
    global _supabase_client, _supabase_error

    if _supabase_client is not None:
        return _supabase_client

    if _supabase_error is not None:
        raise RuntimeError(_supabase_error)

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    if not url or not key:
        error_msg = (
            "Missing SUPABASE_URL or SUPABASE_KEY environment variables. "
            "Please set these in your .env file or environment configuration."
        )
        _supabase_error = error_msg
        logger.error(error_msg)
        raise RuntimeError(error_msg)

    try:
        _supabase_client = create_client(url, key)
        logger.info("✓ Supabase client initialized successfully")
        return _supabase_client
    except Exception as e:
        error_msg = f"Failed to initialize Supabase client: {str(e)}"
        _supabase_error = error_msg
        logger.error(error_msg)
        raise RuntimeError(error_msg)


# Provide a property to access supabase
def supabase():
    """Accessor function for lazy-loaded Supabase client"""
    return get_supabase()


ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "admin123",
    "name": "Administrator",
    "role": "admin",
}
AUTH_STORE_PATH = Path(__file__).resolve().parent / "auth_accounts.json"
DB_TABLE_EXISTS_CACHE = {}
app.jinja_env.filters["currency"] = format_currency


def get_role_id_for_app_role(role):
    app_role = canonical_app_role_name(role)
    role_name = APP_ROLE_TO_DB_ROLE_NAME.get(app_role, "Sales Staff")
    if not table_exists("role"):
        return 0
    for row in fetch_raw_rows("role"):
        if str(row.get("role_name", "")).strip().lower() == role_name.lower():
            return safe_int(row.get("role_id"), 0)
    return 0




def get_inventory_row(product_id):
    return inventory_get_row(
        product_id,
        safe_int=safe_int,
        table_exists=table_exists,
        supabase=supabase(),
    )


def upsert_inventory_record(product_id, stock_quantity, reorder_level=10, reference_id=None):
    return inventory_upsert_record(
        product_id,
        stock_quantity,
        reorder_level,
        reference_id,
        safe_int=safe_int,
        table_exists=table_exists,
        get_inventory_row=get_inventory_row,
        supabase=supabase(),
    )


def resolve_db_user_row(current_user=None):
    current_user = current_user or get_current_user() or {}
    username = str(current_user.get("username", "")).strip()
    if not username:
        return None

    existing_user = next(
        (row for row in fetch_rows("user") if str(row.get("username", "")).strip().lower() == username.lower()),
        None,
    )
    if existing_user:
        return existing_user

    app_role = canonical_app_role_name(current_user.get("role"))
    if app_role == "admin":
        return create_user_profile(
            current_user.get("name") or ADMIN_CREDENTIALS["name"],
            username,
            app_role,
            ADMIN_CREDENTIALS["password"],
            current_user.get("status") or "active",
        )

    account = find_auth_account(current_user.get("staff_code") or username)
    if account:
        return sync_staff_user_record(account, previous_username=username)
    return None


def table_exists(table_name):
    if table_name in DB_TABLE_EXISTS_CACHE:
        return DB_TABLE_EXISTS_CACHE[table_name]
    try:
        supabase().table(table_name).select("*").limit(1).execute()
        DB_TABLE_EXISTS_CACHE[table_name] = True
    except Exception:
        DB_TABLE_EXISTS_CACHE[table_name] = False
    return DB_TABLE_EXISTS_CACHE[table_name]


def fetch_raw_rows(table_name, query="*"):
    return supabase().table(table_name).select(query).execute().data or []


def adapt_product_payload_for_schema(payload, error):
    """
    Gracefully handle legacy product schemas that do not yet include
    newer columns like `brand`.
    """
    error_text = str(error)
    updated_payload = dict(payload)
    adapted = False
    adaptation_notes = []

    if (
        "Could not find the 'brand' column of 'product'" in error_text
        and "brand" in updated_payload
    ):
        updated_payload.pop("brand", None)
        adapted = True
        adaptation_notes.append("missing_brand_column")

    if "product_status_check" in error_text or "violates check constraint" in error_text:
        current_status = str(updated_payload.get("status") or "").strip().lower()
        if current_status in ("available", "active", ""):
            updated_payload["status"] = "active"
            adapted = True
            adaptation_notes.append("status_mapped")
        elif current_status in ("not available", "not_available", "inactive", "discontinued"):
            updated_payload["status"] = "inactive"
            adapted = True
            adaptation_notes.append("status_mapped")

    return updated_payload, adapted, adaptation_notes


def adapt_customer_payload_for_schema(payload, error):
    """
    Gracefully handle legacy customer schemas that may not include
    newer columns like `address` or `status`.
    """
    error_text = str(error)
    updated_payload = dict(payload)
    adapted = False
    adaptation_notes = []

    # Example error: Could not find the 'address' column of 'customer' in the schema cache
    match = re.search(r"Could not find the '([^']+)' column of 'customer'", error_text)
    if match:
        missing_column = match.group(1)
        if missing_column in updated_payload:
            updated_payload.pop(missing_column, None)
            adapted = True
            adaptation_notes.append(f"missing_{missing_column}_column")

    return updated_payload, adapted, adaptation_notes


def execute_customer_write_with_schema_fallback(operation, payload):
    """
    Execute a customer insert/update operation with compatibility retries for
    legacy schemas missing one or more columns.
    """
    working_payload = dict(payload)
    adaptation_notes = []

    while True:
        try:
            operation(working_payload)
            return adaptation_notes
        except Exception as exc:
            compatible_payload, was_adapted, new_notes = adapt_customer_payload_for_schema(working_payload, exc)
            if not was_adapted:
                raise
            working_payload = compatible_payload
            adaptation_notes.extend(new_notes)


def normalize_user_rows(rows):
    role_lookup = {}
    if table_exists("role"):
        role_lookup = {
            safe_int(row.get("role_id"), 0): row.get("role_name", "")
            for row in fetch_raw_rows("role")
        }

    normalized = []
    for row in rows:
        normalized_row = dict(row)
        if "role" not in normalized_row or not normalized_row.get("role"):
            normalized_row["role"] = canonical_app_role_name(
                role_lookup.get(safe_int(normalized_row.get("role_id"), 0), "")
            )
        else:
            normalized_row["role"] = canonical_app_role_name(normalized_row.get("role"))
        normalized_row["status"] = str(normalized_row.get("status") or "active").strip().lower()
        normalized.append(normalized_row)
    return normalized


def normalize_customer_rows(rows):
    normalized = []
    for row in rows:
        normalized_row = dict(row)
        customer_name = normalized_row.get("customer_name") or normalized_row.get("name") or "Unknown Customer"
        phone = normalized_row.get("phone") or normalized_row.get("contact_number")
        normalized_row["customer_name"] = customer_name
        normalized_row["name"] = customer_name
        normalized_row["phone"] = phone
        normalized_row["contact_number"] = phone
        normalized_row["address"] = normalized_row.get("address")
        normalized_row["status"] = str(normalized_row.get("status") or "active").strip().lower()
        if not normalized_row.get("created_at") and normalized_row.get("date_registered"):
            normalized_row["created_at"] = normalized_row.get("date_registered")
        normalized.append(normalized_row)
    return normalized


def normalize_product_rows(rows):
    inventory_lookup = {}
    if table_exists("inventory"):
        inventory_lookup = {}
        for row in fetch_raw_rows("inventory"):
            row_product_id = str(row.get("product_id") or "").strip()
            if not row_product_id:
                continue
            inventory_lookup[row_product_id] = row

    normalized = []
    for index, row in enumerate(rows, start=1):
        normalized_row = dict(row)
        product_id = str(normalized_row.get("product_id") or "").strip()
        inventory_row = inventory_lookup.get(product_id, {})
        normalized_row["stock_quantity"] = safe_int(
            normalized_row.get("stock_quantity", inventory_row.get("stock_quantity")),
            0,
        )
        normalized_row["reorder_level"] = safe_int(
            normalized_row.get("reorder_level", inventory_row.get("reorder_level")),
            10,
        )
        normalized_row["reference_id"] = normalized_row.get("reference_id", inventory_row.get("reference_id"))
        normalized_row["updated_at"] = normalized_row.get("updated_at") or inventory_row.get("last_updated")
        normalized_row["sku"] = normalized_row.get("sku") or build_product_sku(normalized_row, index)
        normalized_row["status"] = str(normalized_row.get("status") or "Available")
        normalized.append(normalized_row)
    return normalized


def normalize_sales_transaction_rows(rows):
    normalized = []
    for row in rows:
        normalized_row = dict(row)
        payment_method = str(normalized_row.get("payment_method") or "cash").strip()
        normalized_row["payment_method"] = payment_method.lower()
        normalized.append(normalized_row)
    return normalized


def normalize_sales_analytics_rows(rows):
    normalized = []
    for row in rows:
        normalized_row = dict(row)
        normalized_row["sales_analytics_id"] = normalized_row.get("sales_analytics_id", normalized_row.get("analytics_id"))
        normalized.append(normalized_row)
    return normalized


def normalize_return_transaction_rows(rows):
    reason_lookup = {}
    if table_exists("return_details"):
        for detail in fetch_raw_rows("return_details"):
            return_id = safe_int(detail.get("return_id"), 0)
            if return_id <= 0 or return_id in reason_lookup:
                continue
            reason = str(detail.get("reason") or "").strip()
            if reason:
                reason_lookup[return_id] = reason

    sales_lookup = {
        safe_int(row.get("sales_id"), 0): row
        for row in fetch_raw_rows("sales_transaction")
        if safe_int(row.get("sales_id"), 0) > 0
    }
    normalized = []
    for row in rows:
        normalized_row = dict(row)
        sale = sales_lookup.get(safe_int(normalized_row.get("sales_id"), 0), {})
        normalized_row["customer_id"] = normalized_row.get("customer_id", sale.get("customer_id"))
        normalized_row["payment_method"] = normalized_row.get("payment_method") or sale.get("payment_method")
        normalized_row["reason"] = normalized_row.get("reason") or reason_lookup.get(
            safe_int(normalized_row.get("return_id"), 0),
            "Return processed",
        )
        normalized.append(normalized_row)
    return normalized


def normalize_return_detail_rows(rows):
    normalized = []
    for row in rows:
        normalized_row = dict(row)
        normalized_row["quantity"] = normalized_row.get("quantity", normalized_row.get("quantity_returned"))
        normalized.append(normalized_row)
    return normalized


def fetch_rows(table_name, query="*"):
    source_table = {"return_transaction": "returns"}.get(table_name, table_name)
    rows = fetch_raw_rows(source_table, query)

    if table_name == "user":
        return normalize_user_rows(rows)
    if table_name == "customer":
        return normalize_customer_rows(rows)
    if table_name == "product":
        return normalize_product_rows(rows)
    if table_name == "sales_transaction":
        return normalize_sales_transaction_rows(rows)
    if table_name == "sales_analytics":
        return normalize_sales_analytics_rows(rows)
    if table_name == "return_transaction":
        return normalize_return_transaction_rows(rows)
    if table_name == "return_details":
        return normalize_return_detail_rows(rows)
    return rows


def set_notice(message, tone="success"):
    session["notice"] = {"message": message, "tone": tone}


def pop_notice():
    return session.pop("notice", None)


def hash_password(password):
    return store_hash_password(password)


def load_auth_accounts():
    return store_load_auth_accounts(AUTH_STORE_PATH)


def save_auth_accounts(accounts):
    store_save_auth_accounts(AUTH_STORE_PATH, accounts, safe_int)


def find_auth_account(identifier, role=None):
    return store_find_auth_account(AUTH_STORE_PATH, identifier, role)


def generate_staff_code(accounts):
    return store_generate_staff_code(accounts, safe_int)


def sync_staff_user_record(account, previous_username=None):
    return staff_sync_user_record(
        account,
        previous_username,
        get_role_id_for_app_role=get_role_id_for_app_role,
        db_user_status=db_user_status,
        fetch_rows=fetch_rows,
        safe_int=safe_int,
        supabase=supabase(),
    )


def upsert_staff_account(existing_code, name, username, email, password, role, status):
    return staff_upsert_account(
        existing_code,
        name,
        username,
        email,
        password,
        role,
        status,
        load_auth_accounts=load_auth_accounts,
        generate_staff_code=generate_staff_code,
        hash_password=hash_password,
        normalize_staff_role=normalize_staff_role,
        normalize_account_status=normalize_account_status,
        save_auth_accounts=save_auth_accounts,
        sync_staff_user_record=sync_staff_user_record,
    )


def build_staff_rows():
    return staff_build_rows(
        load_auth_accounts=load_auth_accounts,
        fetch_rows=fetch_rows,
        canonical_app_role_name=canonical_app_role_name,
        safe_int=safe_int,
        format_role_label=format_role_label,
        normalize_account_status=normalize_account_status,
        format_short_date=format_short_date,
    )


def build_staff_form_data(form, include_role_status=True):
    return staff_build_form_data(form, include_role_status=include_role_status)


def is_protected_staff_account(staff_code, username):
    return staff_is_protected_account(
        staff_code,
        username,
        admin_username=ADMIN_CREDENTIALS["username"],
    )


def get_protected_staff_notice():
    return staff_get_protected_notice()


def build_system_notifications(current_user=None):
    return ui_build_system_notifications(
        current_user,
        table_exists=table_exists,
        fetch_raw_rows=fetch_raw_rows,
        build_customer_lookup=build_customer_lookup,
        fetch_rows=fetch_rows,
        parse_iso_datetime=parse_iso_datetime,
        safe_int=safe_int,
    )


def ensure_core_role_accounts():
    if not table_exists("user"):
        return
    defaults = [
        ("admin", ADMIN_CREDENTIALS["name"], ADMIN_CREDENTIALS["username"], ADMIN_CREDENTIALS["password"], "active"),
        ("sales_staff", "Sales Staff Account", "sales", "sales123", "active"),
        ("inventory_staff", "Inventory Staff Account", "inventory", "inv123", "active"),
    ]
    for role, name, username, password, status in defaults:
        existing = next(
            (row for row in fetch_rows("user") if str(row.get("username", "")).strip().lower() == username.lower()),
            None,
        )
        if existing:
            continue
        create_user_profile(name, username, role, password=password, status=status)


def sync_sales_summary_entry(summary_date=None):
    return sales_sync_summary_entry(
        summary_date,
        table_exists=table_exists,
        datetime_cls=datetime,
        build_sale_status_maps=build_sale_status_maps,
        fetch_rows=fetch_rows,
        safe_int=safe_int,
        safe_float=safe_float,
        defaultdict_cls=defaultdict,
        parse_iso_datetime=parse_iso_datetime,
        supabase=supabase(),
    )


def format_prediction_period_label(value):
    return sync_format_prediction_period_label(value)


def sync_promotion_notifications(promo_id):
    return promotion_sync_notifications(
        promo_id,
        safe_int=safe_int,
        table_exists=table_exists,
        supabase=supabase(),
        build_sale_status_maps=build_sale_status_maps,
        fetch_rows=fetch_rows,
        build_customer_lookup=build_customer_lookup,
    )


def ensure_default_categories():
    try:
        categories = fetch_rows("category")
        existing_names = {str(row.get("category_name", "")).strip().lower() for row in categories}
        missing_names = [
            {"category_name": name}
            for name in DEFAULT_CATEGORY_NAMES
            if name.strip().lower() not in existing_names
        ]
        if missing_names:
            supabase().table("category").insert(missing_names).execute()
    except Exception:
        pass


def send_otp_email(recipient_email, otp_code, display_name):
    smtp_email = os.getenv("GMAIL_APP_EMAIL")
    smtp_password = os.getenv("GMAIL_APP_PASSWORD")
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    if not smtp_email or not smtp_password:
        raise RuntimeError(
            "Email OTP is not configured. Set GMAIL_APP_EMAIL and GMAIL_APP_PASSWORD first."
        )

    message = EmailMessage()
    message["Subject"] = "Your Meryl Shoes OTP Code"
    message["From"] = smtp_email
    message["To"] = recipient_email
    message.set_content(
        "\n".join(
            [
                f"Hello {display_name},",
                "",
                f"Your OTP code is: {otp_code}",
                "This code expires in 10 minutes.",
                "",
                "If you did not request this, you can ignore this email.",
            ]
        )
    )

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_email, smtp_password)
        server.send_message(message)


def create_user_profile(name, username, role, password=None, status="active"):
    try:
        existing_rows = fetch_rows("user")
        existing_user = next(
            (
                row
                for row in existing_rows
                if str(row.get("username", "")).strip().lower() == username.lower()
            ),
            None,
        )
        if existing_user:
            return existing_user

        role_id = get_role_id_for_app_role(role)
        if role_id <= 0:
            return None

        created = (
            supabase().table("user")
            .insert(
                {
                    "name": name,
                    "username": username,
                    "password": password or (
                        ADMIN_CREDENTIALS["password"] if canonical_app_role_name(role) == "admin" else "staff123"
                    ),
                    "role_id": role_id,
                    "status": db_user_status(status),
                }
            )
            .execute()
            .data
            or []
        )
        if created:
            return created[0]
    except Exception:
        return None

    return None


def get_current_user():
    return ui_build_current_user_context(
        session.get("current_user"),
        build_system_notifications=build_system_notifications,
    )


def get_navigation_items():
    return ui_build_navigation_items(get_current_user())


def render_page(template_name, **context):
    return render_template(
        template_name,
        **ui_build_render_context(
            pop_notice=pop_notice,
            get_current_user=get_current_user,
            get_navigation_items=get_navigation_items,
            extra_context=context,
        ),
    )


def get_post_login_redirect(role):
    return ui_get_post_login_redirect(role)


def get_account_settings_fallback_redirect(role):
    return ui_get_account_settings_fallback_redirect(role)


def build_login_form_data(form):
    return ui_build_login_form_data(form)


def build_session_user_payload(user):
    return ui_build_session_user_payload(user)


def build_admin_login_payload(admin_credentials):
    return ui_build_admin_login_payload(admin_credentials)


def build_staff_login_payload(account):
    return ui_build_staff_login_payload(account)


def get_missing_account_notice():
    return ui_get_missing_account_notice()


def get_missing_account_redirect(role, for_save=False):
    return ui_get_missing_account_redirect(role, for_save=for_save)


def get_logout_notice():
    return ui_get_logout_notice()


def get_logout_redirect():
    return ui_get_logout_redirect()


def get_login_required_notice():
    return ui_get_login_required_notice()


def get_access_denied_notice():
    return ui_get_access_denied_notice()


def get_invalid_login_notice():
    return ui_get_invalid_login_notice()


def login_required(view_func):
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        if not session.get("current_user"):
            set_notice(get_login_required_notice(), "warning")
            return redirect(url_for("login"))
        return view_func(*args, **kwargs)

    return wrapped_view


def roles_required(*allowed_roles):
    def decorator(view_func):
        @wraps(view_func)
        def wrapped_view(*args, **kwargs):
            if not session.get("current_user"):
                set_notice(get_login_required_notice(), "warning")
                return redirect(url_for("login"))

            current_role = session.get("current_user", {}).get("role")
            if current_role not in allowed_roles:
                set_notice(get_access_denied_notice(), "warning")
                return redirect("/")
            return view_func(*args, **kwargs)

        return wrapped_view

    return decorator


# Request lifecycle hooks for robustness
@app.before_request
def before_request():
    """Called before each request. Can be used for setup."""
    # Store connection status in Flask's g object for this request
    try:
        supabase()
        g.supabase_connected = True
    except Exception as e:
        g.supabase_connected = False
        g.supabase_error = str(e)


# Health check endpoint (no auth required)
@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify app is running and Supabase is configured."""
    try:
        # Try to check if Supabase is accessible
        supabase()
        return {
            "status": "healthy",
            "message": "Application is running with Supabase connected",
            "database": "connected"
        }, 200
    except Exception as e:
        return {
            "status": "degraded",
            "message": "Application is running but Supabase is not configured",
            "database": "disconnected",
            "error": str(e)
        }, 200  # Still return 200 so the app is considered alive


# Error handler for Supabase initialization failures
@app.errorhandler(RuntimeError)
def handle_runtime_error(error):
    """Handle runtime errors, particularly Supabase initialization failures."""
    error_msg = str(error)
    if "Supabase" in error_msg or "environment variables" in error_msg:
        logger.error(f"Configuration error: {error_msg}")
        return render_template("error.html",
            title="Configuration Error",
            message="The application is not properly configured. Please set SUPABASE_URL and SUPABASE_KEY environment variables.",
            details=error_msg
        ), 500
    return render_template("error.html",
        title="Application Error",
        message="An unexpected error occurred",
        details=error_msg
    ), 500


@app.route("/login", methods=["GET", "POST"])
def login():
    ensure_core_role_accounts()
    if request.method == "POST":
        form_data = build_login_form_data(request.form)
        user = authenticate_login(form_data["username"], form_data["password"])
        if user:
            session["current_user"] = build_session_user_payload(user)
            set_notice(f"Welcome back, {user.get('name', 'User')}.")
            return redirect(get_post_login_redirect(user.get("role")))
        set_notice(get_invalid_login_notice(), "danger")
    return render_page("login.html")


@app.route("/")
@login_required
def dashboard():
    context = page_build_dashboard_context(
        build_sales_rows=build_sales_rows,
        normalize_inventory_products=normalize_inventory_products,
        fetch_rows=fetch_rows,
        safe_float=safe_float,
        build_product_lookup=build_product_lookup,
        safe_int=safe_int,
    )
    return render_page("dashboard.html", **context)


@app.route("/sales")
@login_required
@roles_required("admin")
def sales():
    context = page_build_sales_context(
        build_sales_rows=build_sales_rows,
        datetime_cls=datetime,
        safe_float=safe_float,
    )
    return render_page("sales.html", **context)


@app.route("/sales/export.csv")
@login_required
@roles_required("admin")
def sales_export_csv():
    csv_content = page_build_sales_export_csv_content(
        build_sales_rows=build_sales_rows,
        format_currency=format_currency,
    )
    response = Response(csv_content, mimetype="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=sales-records.csv"
    return response


@app.route("/inventory")
@login_required
@roles_required("admin", "inventory_staff")
def inventory():
    context = page_build_inventory_context(
        normalize_inventory_products=normalize_inventory_products,
        fetch_rows=fetch_rows,
        build_filter_options=build_filter_options,
        safe_int=safe_int,
        build_category_options=build_category_options,
    )
    return render_page("inventory.html", **context)


@app.route("/customers")
@login_required
@roles_required("admin")
def customers():
    context = page_build_customers_context(
        build_customer_rows=build_customer_rows,
        safe_int=safe_int,
    )
    return render_page("customers.html", **context)


@app.route("/staff")
@login_required
@roles_required("admin")
def staff_accounts():
    context = page_build_staff_accounts_context(
        ensure_core_role_accounts=ensure_core_role_accounts,
        build_staff_rows=build_staff_rows,
        generate_staff_code=generate_staff_code,
        load_auth_accounts=load_auth_accounts,
    )
    return render_page("staff_accounts.html", **context)


@app.route("/staff/save", methods=["POST"])
@login_required
@roles_required("admin")
def staff_accounts_save():
    try:
        form_data = build_staff_form_data(request.form)
    except ValueError as exc:
        set_notice(str(exc), "danger")
        return redirect("/staff")

    if is_protected_staff_account(form_data["staff_code"], form_data["username"]):
        set_notice(get_protected_staff_notice(), "warning")
        return redirect("/staff")

    try:
        saved_account = upsert_staff_account(
            form_data["staff_code"],
            form_data["name"],
            form_data["username"],
            form_data["email"],
            form_data["password"],
            form_data["role"],
            form_data["status"],
        )
        set_notice(f"Staff account {saved_account.get('staff_code')} saved successfully.")
    except ValueError as exc:
        set_notice(str(exc), "danger")
    except Exception as exc:
        set_notice(f"Unable to save staff account: {exc}", "danger")
    return redirect("/staff")


@app.route("/account/settings")
@login_required
@roles_required("sales_staff", "inventory_staff")
def account_settings():
    current_user = session.get("current_user", {})
    account = find_auth_account(current_user.get("staff_code") or current_user.get("username"))
    if not account:
        set_notice(get_missing_account_notice(), "warning")
        return redirect(get_missing_account_redirect(current_user.get("role")))
    return render_page("account_settings.html", account=account)


@app.route("/account/settings/save", methods=["POST"])
@login_required
@roles_required("sales_staff", "inventory_staff")
def account_settings_save():
    current_user = session.get("current_user", {})
    account = find_auth_account(current_user.get("staff_code") or current_user.get("username"))
    if not account:
        set_notice(get_missing_account_notice(), "warning")
        return redirect(get_missing_account_redirect(current_user.get("role"), for_save=True))

    try:
        form_data = build_staff_form_data(request.form, include_role_status=False)
    except ValueError as exc:
        set_notice(str(exc), "danger")
        return redirect("/account/settings")

    try:
        saved_account = upsert_staff_account(
            account.get("staff_code"),
            form_data["name"],
            form_data["username"],
            form_data["email"],
            form_data["password"],
            account.get("role"),
            account.get("status"),
        )
        session["current_user"] = build_session_user_payload(saved_account)
        set_notice("Your account details were updated successfully.")
    except ValueError as exc:
        set_notice(str(exc), "danger")
    except Exception as exc:
        set_notice(f"Unable to update account settings: {exc}", "danger")
    return redirect("/account/settings")


@app.route("/predictive")
@login_required
@roles_required("admin")
def predictive():
    demand_range = (request.args.get("demand_range") or "week").strip().lower()
    forecast_range = (request.args.get("forecast_range") or "last6").strip().lower()
    demand_day = (request.args.get("demand_day") or "").strip()
    demand_week = (request.args.get("demand_week") or "").strip()
    demand_month = (request.args.get("demand_month") or "").strip()
    context = page_build_predictive_context(
        demand_range=demand_range,
        forecast_range=forecast_range,
        demand_day=demand_day,
        demand_week=demand_week,
        demand_month=demand_month,
        build_predictive_context=build_predictive_context,
        safe_float=safe_float,
        round_fn=round,
    )
    return render_page("predictive.html", **context)


def build_chart_points(items, label_key, value_key, min_height=72, max_height=240):
    return sales_build_chart_points(
        items,
        label_key,
        value_key,
        min_height,
        max_height,
        safe_float=safe_float,
    )


def build_product_sku(product, index):
    return inventory_build_product_sku(product, index)


def build_category_lookup():
    return inventory_build_category_lookup(
        ensure_default_categories=ensure_default_categories,
        fetch_rows=fetch_rows,
    )


def build_category_options():
    return inventory_build_category_options(
        ensure_default_categories=ensure_default_categories,
        fetch_rows=fetch_rows,
    )


def sync_promotion_products(promo_id, target_category_id=None, target_product_id=None):
    return promotion_sync_products(
        promo_id,
        target_category_id,
        target_product_id,
        supabase=supabase(),
        safe_int=safe_int,
    )


def build_filter_options(inventory_products):
    return inventory_build_filter_options(inventory_products, safe_float=safe_float)


def build_product_group_key(product):
    return inventory_build_product_group_key(product, slugify_text=slugify_text)


def get_or_create_customer(customer_name, email="", phone="", address=""):
    return customer_get_or_create(
        customer_name,
        email,
        phone,
        address,
        fetch_rows=fetch_rows,
        supabase=supabase(),
        normalize_customer_rows=normalize_customer_rows,
    )


def build_pos_catalog(products):
    return pos_build_catalog(
        products,
        build_product_group_key=build_product_group_key,
        safe_float=safe_float,
        safe_int=safe_int,
    )


def build_sale_status_maps():
    return sales_build_status_maps(
        fetch_rows=fetch_rows,
        safe_int=safe_int,
        parse_iso_datetime=parse_iso_datetime,
        datetime_cls=datetime,
    )


def sync_sales_analytics_entry(product_id, quantity_delta, amount_delta):
    return sync_sales_analytics_entry_helper(
        product_id,
        quantity_delta,
        amount_delta,
        safe_int=safe_int,
        supabase=supabase(),
        safe_float=safe_float,
    )


def complete_sale_inventory(sales_id):
    return inventory_flow_complete_sale(
        sales_id,
        build_sale_status_maps=build_sale_status_maps,
        supabase=supabase(),
        safe_int=safe_int,
        get_inventory_row=get_inventory_row,
        upsert_inventory_record=upsert_inventory_record,
        sync_sales_analytics_entry=sync_sales_analytics_entry,
        safe_float=safe_float,
        table_exists=table_exists,
        db_payment_status=db_payment_status,
        sync_sales_summary_entry=sync_sales_summary_entry,
    )


def build_forecast_periods(forecast_range):
    return forecast_build_periods(forecast_range, datetime_cls=datetime)


def build_demand_range_buckets(demand_range):
    return forecast_build_demand_buckets(
        demand_range,
        datetime_cls=datetime,
        timedelta_cls=timedelta,
    )


def build_price_lookup():
    return inventory_build_price_lookup(
        fetch_rows=fetch_rows,
        safe_int=safe_int,
        safe_float=safe_float,
    )


def build_stock_lookup():
    return inventory_build_stock_lookup(
        table_exists=table_exists,
        fetch_rows=fetch_rows,
        safe_int=safe_int,
    )


def build_active_promotion_lookup():
    return promotion_build_active_lookup(
        fetch_rows=fetch_rows,
        parse_iso_datetime=parse_iso_datetime,
    )


def compute_promo_discount(base_price, promo):
    return promotion_compute_discount(
        base_price,
        promo,
        normalize_promotion_type=normalize_promotion_type,
        safe_float=safe_float,
    )


def normalize_cart_items(cart):
    return pos_normalize_cart_items(
        cart,
        safe_float=safe_float,
        safe_int=safe_int,
    )


def normalize_inventory_products(products):
    return inventory_normalize_products(
        products,
        build_category_lookup=build_category_lookup,
        build_price_lookup=build_price_lookup,
        build_stock_lookup=build_stock_lookup,
        build_active_promotion_lookup=build_active_promotion_lookup,
        safe_float=safe_float,
        safe_int=safe_int,
        compute_promo_discount=compute_promo_discount,
        build_product_sku=build_product_sku,
        build_product_group_key=build_product_group_key,
    )


def build_product_lookup():
    return inventory_build_product_lookup(
        normalize_inventory_products=normalize_inventory_products,
        fetch_rows=fetch_rows,
    )


def build_user_lookup():
    return {row["user_id"]: row for row in fetch_rows("user")}


def build_customer_lookup():
    return customer_build_lookup(fetch_rows=fetch_rows)


def authenticate_login(identifier, password):
    normalized_identifier = identifier.strip().lower()
    if (
        normalized_identifier == ADMIN_CREDENTIALS["username"]
        and password == ADMIN_CREDENTIALS["password"]
    ):
        return build_admin_login_payload(ADMIN_CREDENTIALS)

    account = find_auth_account(normalized_identifier)
    if not account:
        return None

    if account.get("role") not in STAFF_ROLES:
        return None

    password_hash = account.get("password_hash")
    password_match = password_hash == hash_password(password) if password_hash else account.get("password") == password
    if not password_match:
        return None

    return build_staff_login_payload(account)


def build_sales_rows():
    return sales_build_rows(
        build_product_lookup=build_product_lookup,
        build_customer_lookup=build_customer_lookup,
        build_sale_status_maps=build_sale_status_maps,
        fetch_rows=fetch_rows,
        parse_iso_datetime=parse_iso_datetime,
        datetime_cls=datetime,
        safe_int=safe_int,
        safe_float=safe_float,
    )


def build_customer_rows():
    return customer_build_rows(
        fetch_rows=fetch_rows,
        build_sale_status_maps=build_sale_status_maps,
        safe_int=safe_int,
        safe_float=safe_float,
        parse_iso_datetime=parse_iso_datetime,
        datetime_cls=datetime,
    )


def get_reorder_level(product):
    return inventory_get_reorder_level(product, safe_int=safe_int)


def moving_average_forecast(values, window=3):
    return forecast_moving_average(values, window=window, safe_float=safe_float)


def weighted_moving_average_forecast(values, window=4):
    return forecast_weighted_moving_average(values, window=window, safe_float=safe_float)


def linear_regression_forecast(values):
    return forecast_linear_regression(values, safe_float=safe_float)


def blended_recent_forecast(values):
    return forecast_blended_recent(
        values,
        safe_float=safe_float,
        moving_average_forecast_fn=moving_average_forecast,
        weighted_moving_average_forecast_fn=weighted_moving_average_forecast,
        linear_regression_forecast_fn=linear_regression_forecast,
    )


def sync_prediction_results(prediction_payloads):
    return sync_prediction_results_helper(
        prediction_payloads,
        fetch_rows=fetch_rows,
        safe_int=safe_int,
        safe_float=safe_float,
        supabase=supabase(),
        table_exists=table_exists,
    )


def build_predictive_context(demand_range="week", forecast_range="last6", demand_day=None, demand_week=None, demand_month=None):
    return predictive_build_context(
        demand_range,
        forecast_range,
        demand_day=demand_day,
        demand_week=demand_week,
        demand_month=demand_month,
        build_product_lookup=build_product_lookup,
        fetch_rows=fetch_rows,
        build_sale_status_maps=build_sale_status_maps,
        safe_int=safe_int,
        build_demand_range_buckets=build_demand_range_buckets,
        build_forecast_periods=build_forecast_periods,
        parse_iso_datetime=parse_iso_datetime,
        safe_float=safe_float,
        get_reorder_level=get_reorder_level,
        weighted_moving_average_forecast=weighted_moving_average_forecast,
        linear_regression_forecast=linear_regression_forecast,
        blended_recent_forecast=blended_recent_forecast,
        sync_prediction_results=sync_prediction_results,
        format_prediction_period_label=format_prediction_period_label,
    )


def build_promotions_context():
    return promotion_build_context(
        fetch_rows=fetch_rows,
        build_product_lookup=build_product_lookup,
        safe_float=safe_float,
        safe_int=safe_int,
        normalize_promotion_type=normalize_promotion_type,
        format_promotion_type=format_promotion_type,
        format_promotion_discount=format_promotion_discount,
        format_short_date=format_short_date,
        build_chart_points=build_chart_points,
    )


def build_reports_context():
    return predictive_build_reports_context(
        build_sale_status_maps=build_sale_status_maps,
        fetch_rows=fetch_rows,
        build_product_lookup=build_product_lookup,
        normalize_inventory_products=normalize_inventory_products,
        build_customer_lookup=build_customer_lookup,
        safe_int=safe_int,
        parse_iso_datetime=parse_iso_datetime,
        safe_float=safe_float,
        build_chart_points=build_chart_points,
        sync_sales_summary_entry=sync_sales_summary_entry,
        get_reorder_level=get_reorder_level,
    )


@app.route("/promotions")
@login_required
@roles_required("admin")
def promotions():
    (
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
    ) = build_promotions_context()
    return render_page(
        "promotions.html",
        campaign_rows=campaign_rows,
        active_count=active_count,
        total_revenue=total_revenue,
        total_units=total_units,
        average_effectiveness=average_effectiveness,
        promotion_chart=promotion_chart,
        category_impact=category_impact,
        discount_effectiveness=discount_effectiveness,
        discount_ticks=discount_ticks,
        promotion_comparison=promotion_comparison,
        category_distribution=category_distribution,
        category_options=build_category_options(),
    )


@app.route("/promotions/save", methods=["POST"])
@login_required
@roles_required("admin")
def promotions_save():
    promo_id = safe_int(request.form.get("promo_id"), 0)
    promo_name = (request.form.get("promo_name") or "").strip()
    raw_discount_type = (request.form.get("discount_type") or "percentage").strip().lower()
    discount_type = db_promotion_type(raw_discount_type)
    discount_value = safe_float(request.form.get("discount_value"), 0)
    target_category_value = (request.form.get("target_category_id") or "all").strip().lower()
    target_product_id = safe_int(request.form.get("target_product_id"), 0)
    start_date = (request.form.get("start_date") or "").strip()
    end_date = (request.form.get("end_date") or "").strip()
    status = db_promotion_status(request.form.get("status") or "active")

    if not promo_name or not start_date or not end_date:
        set_notice("Promotion name, start date, and end date are required.", "danger")
        return redirect("/promotions")

    payload = {
        "promo_name": promo_name,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "start_date": start_date,
        "end_date": end_date,
        "status": status,
    }

    target_category_id = None if target_category_value == "all" else safe_int(target_category_value)

    try:
        if promo_id > 0:
            supabase().table("promotion").update(payload).eq("promo_id", promo_id).execute()
            linked_count = sync_promotion_products(promo_id, target_category_id, target_product_id)
            sync_promotion_notifications(promo_id)
            set_notice(f"Promotion updated. Linked products: {linked_count}.")
        else:
            created = supabase().table("promotion").insert(payload).execute().data or []
            if not created:
                raise ValueError("Promotion was not created.")
            new_promo_id = created[0]["promo_id"]
            linked_count = sync_promotion_products(new_promo_id, target_category_id, target_product_id)
            sync_promotion_notifications(new_promo_id)
            set_notice(f"Promotion created. Linked products: {linked_count}.")
    except Exception as exc:
        set_notice(f"Unable to save promotion: {exc}", "danger")

    return redirect("/promotions")


@app.route("/promotions/delete/<int:promo_id>", methods=["POST"])
@login_required
@roles_required("admin")
def promotions_delete(promo_id):
    try:
        if table_exists("notification"):
            supabase().table("notification").delete().eq("promo_id", promo_id).execute()
        supabase().table("promo_product").delete().eq("promo_id", promo_id).execute()
        supabase().table("promotion").delete().eq("promo_id", promo_id).execute()
        set_notice("Promotion deleted successfully.")
    except Exception as exc:
        set_notice(f"Unable to delete promotion: {exc}", "danger")
    return redirect("/promotions")


@app.route("/reports")
@login_required
@roles_required("admin", "inventory_staff")
def reports():
    context = page_build_reports_context(
        build_reports_context=build_reports_context,
    )
    return render_page("reports.html", **context)


@app.route("/pos")
@login_required
def pos():
    context = pos_build_page_context(
        normalize_inventory_products=normalize_inventory_products,
        fetch_rows=fetch_rows,
        build_pos_catalog=build_pos_catalog,
        build_filter_options=build_filter_options,
        normalize_cart_items=normalize_cart_items,
        session_obj=session,
    )
    return render_page(
        "pos.html",
        **context,
    )


@app.route("/pos/add", methods=["POST"])
@login_required
def pos_add():
    group_key = (request.form.get("product_group") or "").strip()
    selected_size = (request.form.get("size") or "").strip()
    qty = max(1, safe_int(request.form.get("quantity"), 1))
    discount = max(0, safe_int(request.form.get("discount"), 0))

    products = normalize_inventory_products(fetch_rows("product"))
    product = next(
        (
            item
            for item in products
            if item.get("group_key") == group_key and str(item.get("size", "")).strip() == selected_size
        ),
        None,
    )
    if not group_key:
        set_notice("Select a product first.", "danger")
        return redirect("/pos")
    if not selected_size:
        set_notice("Select a size first.", "warning")
        return redirect("/pos")
    if not product:
        set_notice("Product variant not found.", "danger")
        return redirect("/pos")
    if qty > safe_int(product.get("stock_quantity"), 0):
        set_notice("Quantity exceeds available stock.", "warning")
        return redirect("/pos")

    cart = session.get("cart", [])
    cart = pos_add_product_to_cart(
        cart,
        product,
        selected_size=selected_size,
        qty=qty,
        discount=discount,
        safe_int=safe_int,
        safe_float=safe_float,
    )
    session["cart"] = cart
    set_notice(f"{product['product_name']} (Size {selected_size}) added to cart.")

    return redirect("/pos")


@app.route("/pos/remove/<int:item_index>", methods=["POST"])
@login_required
def pos_remove(item_index):
    cart = normalize_cart_items(session.get("cart", []))
    cart, removed_item, error_message = pos_remove_cart_item(cart, item_index)
    session["cart"] = cart
    if removed_item:
        set_notice(f"{removed_item.get('product_name', 'Item')} removed from cart.")
    else:
        set_notice(error_message or "Cart item not found.", "warning")
    return redirect("/pos")


@app.route("/pos/checkout", methods=["POST"])
@login_required
def pos_checkout():
    cart = normalize_cart_items(session.get("cart", []))
    session["cart"] = cart
    if not cart:
        set_notice("Cart is empty.", "warning")
        return redirect("/pos")

    subtotal = sum(float(item["base_subtotal"]) for item in cart)
    discount_total = sum(float(item["discount_amount"]) for item in cart)
    total = subtotal - discount_total

    selected_customer_id = str(request.form.get("customer_id") or "").strip()
    manual_customer_name = (request.form.get("customer_name") or "").strip()
    manual_customer_email = (request.form.get("new_customer_email") or "").strip().lower()
    manual_customer_phone = (request.form.get("new_customer_phone") or "").strip()
    manual_customer_address = (request.form.get("new_customer_address") or "").strip()
    customer_rows = fetch_rows("customer")
    selected_customer = next(
        (
            row
            for row in customer_rows
            if str(row.get("customer_id") or "").strip() == selected_customer_id
        ),
        None,
    )
    is_add_new_customer = selected_customer_id == "__new__"
    if is_add_new_customer and not manual_customer_name:
        set_notice("Enter customer name for new customer.", "warning")
        return redirect("/pos")

    customer_name = (selected_customer.get("customer_name") if selected_customer else manual_customer_name) or "Walk-in Customer"
    payment_method = request.form.get("payment_method") or "cash"
    cash_received_input = safe_float(request.form.get("cash_received"), 0)
    current_user = get_current_user() or {}
    db_user = resolve_db_user_row(current_user)
    user_id = str((db_user or {}).get("user_id") or "").strip()
    if is_add_new_customer:
        customer = get_or_create_customer(
            customer_name,
            email=manual_customer_email,
            phone=manual_customer_phone,
            address=manual_customer_address,
        )
    else:
        customer = selected_customer or get_or_create_customer(customer_name)
    customer_id = str(customer.get("customer_id") or "").strip()

    if not user_id:
        set_notice("Unable to resolve the logged-in staff account in the database.", "danger")
        return redirect("/pos")

    if str(payment_method).strip().lower() == "cash":
        if cash_received_input < total:
            set_notice("Cash received is less than total amount due.", "warning")
            return redirect("/pos")
        amount_paid = cash_received_input
        change_amount = max(cash_received_input - total, 0)
    else:
        amount_paid = total
        change_amount = 0

    try:
        sale = (
            supabase().table("sales_transaction")
            .insert(
                {
                    "total_amount": total,
                    "customer_id": customer_id or None,
                    "transaction_date": datetime.now().isoformat(),
                    "user_id": user_id,
                }
            )
            .execute()
        )

        sales_id = str((sale.data or [{}])[0].get("sales_id") or "").strip()
        if not sales_id:
            raise ValueError("Sales transaction was not created.")

        supabase().table("payment").insert(
            {
                "sales_id": sales_id,
                "payment_method": db_payment_method(payment_method),
                "amount_paid": amount_paid,
                "change_amount": change_amount,
                "payment_status": db_payment_status("pending"),
            }
        ).execute()
        receipt_timestamp = datetime.now()
        receipt_payload = pos_build_receipt_payload(
            sales_id=sales_id,
            customer_name=customer_name,
            cashier_name=current_user.get("name", "Admin User"),
            payment_method=payment_method,
            subtotal=subtotal,
            discount_total=discount_total,
            total=total,
            cash_received=amount_paid,
            change_amount=change_amount,
            cart=cart,
            receipt_timestamp=receipt_timestamp,
        )

        for item in cart:
            discounted_subtotal = safe_float(item["subtotal"], 0)
            (
                supabase().table("sales_details")
                .insert(
                    {
                        "sales_id": sales_id,
                        "product_id": item["product_id"],
                        "quantity": item["quantity"],
                        "price": item["price"],
                        "discount_applied": item["discount_amount"],
                        "subtotal": discounted_subtotal,
                    }
                )
                .execute()
            )

        session["receipt"] = receipt_payload
        session["last_receipt"] = receipt_payload

        session["cart"] = []
        set_notice("Payment recorded. Sale is now pending admin approval.")
        return redirect("/pos")
    except Exception as exc:
        set_notice(f"Unable to complete payment: {exc}", "danger")
        return redirect("/pos")


@app.route("/sales/complete/<sales_id>", methods=["POST"])
@login_required
@roles_required("admin")
def sales_complete(sales_id):
    try:
        complete_sale_inventory(sales_id)
        set_notice("Transaction completed successfully.")
    except Exception as exc:
        set_notice(f"Unable to complete transaction: {exc}", "danger")
    return redirect("/sales")


@app.route("/sales/deny/<sales_id>", methods=["POST"])
@login_required
@roles_required("admin")
def sales_deny(sales_id):
    reason = (request.form.get("reason") or "").strip()
    if not reason:
        set_notice("Decline reason is required.", "warning")
        return redirect("/sales")

    completed_sales, denied_sales = build_sale_status_maps()
    if sales_id in completed_sales:
        set_notice("Completed transactions cannot be denied.", "danger")
        return redirect("/sales")
    if sales_id in denied_sales:
        set_notice("Transaction is already denied.", "warning")
        return redirect("/sales")

    sale_rows = supabase().table("sales_transaction").select("*").eq("sales_id", sales_id).execute().data or []
    if not sale_rows:
        set_notice("Transaction not found.", "danger")
        return redirect("/sales")

    sale = sale_rows[0]
    try:
        sales_flow_deny_transaction(
            sales_id,
            sale,
            reason,
            get_current_user=get_current_user,
            resolve_db_user_row=resolve_db_user_row,
            safe_int=safe_int,
            supabase=supabase(),
            db_payment_status=db_payment_status,
            db_payment_method=db_payment_method,
            sync_sales_summary_entry=sync_sales_summary_entry,
        )
        set_notice("Transaction denied successfully.")
    except Exception as exc:
        set_notice(f"Unable to deny transaction: {exc}", "danger")
    return redirect("/sales")


@app.route("/pos/receipt")
@login_required
def pos_receipt():
    receipt = pos_get_receipt_from_session(session)
    if not receipt:
        return redirect("/pos")
    return render_page("receipt.html", receipt=receipt)


@app.route("/inventory/add", methods=["POST"])
@login_required
@roles_required("admin", "inventory_staff")
def inventory_add():
    form_data = inventory_build_form_data(
        request.form,
        safe_int=safe_int,
        safe_float=safe_float,
        db_product_status=db_product_status,
    )
    if form_data["error"]:
        set_notice(form_data["error"], form_data["error_tone"])
        return redirect("/inventory")
    stock_quantity = form_data["stock_quantity"]
    payload = form_data["payload"]

    brand_column_missing = False
    try:
        created = supabase().table("product").insert(payload).execute().data or []
    except Exception as exc:
        compatible_payload, was_adapted, adaptation_notes = adapt_product_payload_for_schema(payload, exc)
        brand_column_missing = "missing_brand_column" in adaptation_notes
        if not was_adapted:
            set_notice(f"Unable to add product: {exc}", "danger")
            return redirect("/inventory")
        try:
            created = supabase().table("product").insert(compatible_payload).execute().data or []
        except Exception as retry_exc:
            set_notice(f"Unable to add product: {retry_exc}", "danger")
            return redirect("/inventory")

    try:
        product_id = str((created[0] if created else {}).get("product_id") or "").strip()
        if product_id:
            upsert_inventory_record(product_id, stock_quantity, payload["reorder_level"])
            if stock_quantity > 0:
                supabase().table("inventory_log").insert(
                    inventory_build_log_payload(
                        product_id=product_id,
                        quantity_change=stock_quantity,
                        transaction_type="restock",
                        timestamp=datetime.now().isoformat(),
                    )
                ).execute()
        if brand_column_missing:
            set_notice(
                "Product added, but brand was not saved because your database is missing the product.brand column.",
                "warning",
            )
        else:
            set_notice("Product added successfully.")
    except Exception as exc:
        set_notice(f"Unable to add product: {exc}", "danger")
    return redirect("/inventory")


@app.route("/inventory/update/<product_id>", methods=["POST"])
@login_required
@roles_required("admin", "inventory_staff")
def inventory_update(product_id):
    form_data = inventory_build_form_data(
        request.form,
        safe_int=safe_int,
        safe_float=safe_float,
        db_product_status=db_product_status,
    )
    if form_data["error"]:
        set_notice(form_data["error"], form_data["error_tone"])
        return redirect("/inventory")
    stock_quantity = form_data["stock_quantity"]
    payload = form_data["payload"]

    brand_column_missing = False
    try:
        previous_inventory = get_inventory_row(product_id) or {}
        previous_stock = safe_int(previous_inventory.get("stock_quantity"), 0)
        try:
            supabase().table("product").update(payload).eq("product_id", product_id).execute()
        except Exception as exc:
            compatible_payload, was_adapted, adaptation_notes = adapt_product_payload_for_schema(payload, exc)
            brand_column_missing = "missing_brand_column" in adaptation_notes
            if not was_adapted:
                raise
            supabase().table("product").update(compatible_payload).eq("product_id", product_id).execute()
        upsert_inventory_record(product_id, stock_quantity, payload["reorder_level"])
        stock_delta = stock_quantity - previous_stock
        if stock_delta != 0:
            supabase().table("inventory_log").insert(
                inventory_build_log_payload(
                    product_id=product_id,
                    quantity_change=stock_delta,
                    transaction_type="restock" if stock_delta > 0 else "adjustment",
                    timestamp=datetime.now().isoformat(),
                )
            ).execute()
        if brand_column_missing:
            set_notice(
                "Product updated, but brand was not saved because your database is missing the product.brand column.",
                "warning",
            )
        else:
            set_notice("Product updated successfully.")
    except Exception as exc:
        set_notice(f"Unable to update product: {exc}", "danger")
    return redirect("/inventory")


@app.route("/inventory/delete/<product_id>", methods=["POST"])
@login_required
@roles_required("admin", "inventory_staff")
def inventory_delete(product_id):
    try:
        result = inventory_flow_delete_product(product_id, supabase=supabase())
        if result.get("blocked"):
            set_notice(
                "This product cannot be deleted because it already has sales history. You can update it instead or set its stock to 0.",
                "warning",
            )
            return redirect("/inventory")
        set_notice("Product deleted successfully.")
    except Exception as exc:
        set_notice(f"Unable to delete product: {exc}", "danger")
    return redirect("/inventory")


@app.route("/customers/add", methods=["POST"])
@login_required
def customers_add():
    form_data = customer_build_form_data(request.form)
    if form_data["error"]:
        set_notice(form_data["error"], form_data["error_tone"])
        return redirect("/customers")

    try:
        payload = form_data["payload"]
        create_payload = {
            **payload,
            "date_registered": datetime.now().date().isoformat(),
        }
        adaptation_notes = execute_customer_write_with_schema_fallback(
            lambda write_payload: supabase().table("customer").insert(write_payload).execute(),
            create_payload,
        )
        address_missing = "missing_address_column" in adaptation_notes
        status_missing = "missing_status_column" in adaptation_notes

        if address_missing and status_missing:
            set_notice(
                "Customer added, but address and status were not saved because your database is missing customer.address and customer.status columns.",
                "warning",
            )
        elif address_missing:
            set_notice(
                "Customer added, but address was not saved because your database is missing the customer.address column.",
                "warning",
            )
        elif status_missing:
            set_notice(
                "Customer added, but status was not saved because your database is missing the customer.status column.",
                "warning",
            )
        else:
            set_notice("Customer added successfully.")
    except Exception as exc:
        set_notice(f"Unable to add customer: {exc}", "danger")
    return redirect("/customers")


@app.route("/customers/update/<customer_id>", methods=["POST"])
@login_required
@roles_required("admin")
def customers_update(customer_id):
    form_data = customer_build_form_data(request.form)
    if form_data["error"]:
        set_notice(form_data["error"], form_data["error_tone"])
        return redirect("/customers")

    try:
        payload = form_data["payload"]
        existing_customer = (
            supabase().table("customer")
            .select("customer_id")
            .eq("customer_id", customer_id)
            .limit(1)
            .execute()
        )
        if not existing_customer.data:
            set_notice("Customer record was not found.", "danger")
            return redirect("/customers")

        adaptation_notes = execute_customer_write_with_schema_fallback(
            lambda write_payload: supabase().table("customer").update(write_payload).eq("customer_id", customer_id).execute(),
            payload,
        )
        address_missing = "missing_address_column" in adaptation_notes
        status_missing = "missing_status_column" in adaptation_notes

        if address_missing and status_missing:
            set_notice(
                "Customer updated, but address and status were not saved because your database is missing customer.address and customer.status columns.",
                "warning",
            )
        elif address_missing:
            set_notice(
                "Customer updated, but address was not saved because your database is missing the customer.address column.",
                "warning",
            )
        elif status_missing:
            set_notice(
                "Customer updated, but status was not saved because your database is missing the customer.status column.",
                "warning",
            )
        else:
            set_notice("Customer updated successfully.")
    except Exception as exc:
        set_notice(f"Unable to update customer: {exc}", "danger")
    return redirect("/customers")


@app.route("/customers/delete/<customer_id>", methods=["POST"])
@login_required
@roles_required("admin")
def customers_delete(customer_id):
    try:
        result = customer_delete_record(customer_id, supabase=supabase())
        if result.get("blocked"):
            set_notice(
                "This customer cannot be deleted because there is already sales history linked to this record.",
                "danger",
            )
            return redirect("/customers")
        if result.get("deleted"):
            set_notice("Customer deleted successfully.")
        else:
            set_notice("Customer record was not found.", "danger")
    except Exception as exc:
        set_notice(f"Unable to delete customer: {exc}", "danger")
    return redirect("/customers")


@app.route("/logout")
def logout():
    session.clear()
    set_notice(get_logout_notice(), "success")
    return redirect(get_logout_redirect())


if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("🚀 Meryl Shoes Enterprise System Starting")
    logger.info("=" * 80)

    # Log environment status
    logger.info("📋 Environment Configuration:")
    url_set = bool(os.getenv("SUPABASE_URL"))
    key_set = bool(os.getenv("SUPABASE_KEY"))
    logger.info(f"   • SUPABASE_URL: {'✓ configured' if url_set else '✗ missing'}")
    logger.info(f"   • SUPABASE_KEY: {'✓ configured' if key_set else '✗ missing'}")

    if url_set and key_set:
        logger.info("   → Will attempt to initialize Supabase on first request")
    else:
        logger.warning("   ⚠️  Supabase is not configured!")
        logger.warning("   → Application will run but database features will be unavailable")
        logger.warning("   → Set SUPABASE_URL and SUPABASE_KEY environment variables to enable database functionality")

    logger.info("=" * 80)
    logger.info("✓ Flask app initialized successfully")
    logger.info("  → Visit /health to check status")
    logger.info("  → Visit /login to access the application")
    logger.info("=" * 80)

    app.run(debug=True)
