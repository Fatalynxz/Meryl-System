from datetime import datetime


def build_staff_form_data(form, *, include_role_status=True):
    data = {
        "staff_code": str(form.get("staff_code") or "").strip(),
        "name": str(form.get("name") or "").strip(),
        "username": str(form.get("username") or "").strip(),
        "email": str(form.get("email") or "").strip().lower(),
        "password": form.get("password") or "",
    }
    if include_role_status:
        data["role"] = form.get("role") or "sales_staff"
        data["status"] = form.get("status") or "active"

    if not data["name"] or not data["username"] or not data["email"] or not data["password"]:
        raise ValueError("Name, username, email, and password are required.")

    return data


def is_protected_staff_account(staff_code, username, *, admin_username):
    return str(staff_code or "").strip().upper() == "ADM" or (
        str(username or "").strip().lower() == str(admin_username or "").strip().lower()
    )


def get_protected_staff_notice():
    return "The administrator account cannot be edited in User Management."


def sync_staff_user_record(
    account,
    previous_username,
    *,
    get_role_id_for_app_role,
    db_user_status,
    fetch_rows,
    safe_int,
    supabase,
):
    username = str(account.get("username", "")).strip()
    if not username:
        return None

    role_id = get_role_id_for_app_role(account.get("role", "sales_staff"))
    if role_id <= 0:
        return None

    payload = {
        "name": account.get("name", "Staff User"),
        "username": username,
        "password": account.get("password", "") or "staff123",
        "role_id": role_id,
        "status": db_user_status(account.get("status", "active")),
    }
    try:
        existing_rows = fetch_rows("user")
        if previous_username and previous_username.strip().lower() != username.lower():
            for row in existing_rows:
                if str(row.get("username", "")).strip().lower() == previous_username.strip().lower():
                    supabase.table("user").delete().eq("user_id", row.get("user_id")).execute()
            existing_rows = fetch_rows("user")
        existing_user = next(
            (
                row
                for row in existing_rows
                if str(row.get("username", "")).strip().lower() == username.lower()
            ),
            None,
        )
        if existing_user and safe_int(existing_user.get("user_id"), 0) > 0:
            return (
                supabase.table("user")
                .update(payload)
                .eq("user_id", existing_user.get("user_id"))
                .execute()
                .data
                or [existing_user]
            )[0]
        created = supabase.table("user").insert(payload).execute().data or []
        return created[0] if created else None
    except Exception:
        return None


def upsert_staff_account(
    existing_code,
    name,
    username,
    email,
    password,
    role,
    status,
    *,
    load_auth_accounts,
    generate_staff_code,
    hash_password,
    normalize_staff_role,
    normalize_account_status,
    save_auth_accounts,
    sync_staff_user_record,
):
    accounts = load_auth_accounts()
    normalized_username = str(username or "").strip().lower()
    normalized_email = str(email or "").strip().lower()
    existing_code = str(existing_code or "").strip()
    current_account = next(
        (account for account in accounts if str(account.get("staff_code", "")).strip() == existing_code),
        None,
    )

    for account in accounts:
        if current_account and account is current_account:
            continue
        if normalized_username and str(account.get("username", "")).strip().lower() == normalized_username:
            raise ValueError("Username is already used by another staff account.")
        if normalized_email and str(account.get("email", "")).strip().lower() == normalized_email:
            raise ValueError("Email is already used by another staff account.")

    account_payload = {
        "staff_code": existing_code or generate_staff_code(accounts),
        "name": str(name or "").strip(),
        "username": str(username or "").strip(),
        "email": normalized_email,
        "password": password,
        "password_hash": hash_password(password),
        "role": normalize_staff_role(role),
        "status": normalize_account_status(status),
        "updated_at": datetime.now().isoformat(),
    }
    if current_account:
        previous_username = current_account.get("username", "")
        current_account.update(account_payload)
        target_account = current_account
    else:
        previous_username = None
        account_payload["created_at"] = datetime.now().isoformat()
        accounts.append(account_payload)
        target_account = account_payload

    save_auth_accounts(accounts)
    sync_staff_user_record(target_account, previous_username=previous_username)
    return target_account


def build_staff_rows(
    *,
    load_auth_accounts,
    fetch_rows,
    canonical_app_role_name,
    safe_int,
    format_role_label,
    normalize_account_status,
    format_short_date,
):
    rows = []
    auth_accounts = load_auth_accounts()
    auth_lookup = {
        str(account.get("username", "")).strip().lower(): account
        for account in auth_accounts
        if str(account.get("username", "")).strip()
    }
    seen_usernames = set()

    for user in fetch_rows("user"):
        role = canonical_app_role_name(user.get("role"))
        if role not in {"admin", "sales_staff", "inventory_staff"}:
            continue

        username = str(user.get("username", "")).strip()
        auth_account = auth_lookup.get(username.lower(), {})
        staff_code = str(auth_account.get("staff_code", "")).strip()
        if not staff_code:
            staff_code = "ADM" if role == "admin" else f"{safe_int(user.get('user_id'), 0):03d}"

        status_value = normalize_account_status(auth_account.get("status") or user.get("status"))
        rows.append(
            {
                "staff_code": staff_code,
                "name": auth_account.get("name") or user.get("name", "Staff User"),
                "username": username,
                "email": auth_account.get("email", ""),
                "password": auth_account.get("password") or user.get("password", ""),
                "role": role,
                "role_label": "Administrator" if role == "admin" else format_role_label(role),
                "status": status_value,
                "status_label": status_value.title(),
                "updated_at": format_short_date(auth_account.get("updated_at") or user.get("updated_at")),
            }
        )
        seen_usernames.add(username.lower())

    for account in auth_accounts:
        username = str(account.get("username", "")).strip()
        if not username or username.lower() in seen_usernames:
            continue
        role = canonical_app_role_name(account.get("role"))
        if role not in {"admin", "sales_staff", "inventory_staff"}:
            continue
        status_value = normalize_account_status(account.get("status"))
        rows.append(
            {
                "staff_code": str(account.get("staff_code", "")).strip() or "---",
                "name": account.get("name", "Staff User"),
                "username": username,
                "email": account.get("email", ""),
                "password": account.get("password", ""),
                "role": role,
                "role_label": "Administrator" if role == "admin" else format_role_label(role),
                "status": status_value,
                "status_label": status_value.title(),
                "updated_at": format_short_date(account.get("updated_at")),
            }
        )

    rows.sort(
        key=lambda item: (
            0 if item.get("role") == "admin" else 1,
            safe_int(item.get("staff_code"), 9999) if str(item.get("staff_code", "")).isdigit() else 0,
            str(item.get("name", "")).lower(),
        )
    )
    return rows
