# Implementation Rollout Checklist

This checklist maps to your objectives:
- Real-time POS
- Automated inventory control
- Predictive analytics for demand
- Analytics-driven promotion optimization
- Usability, security, and privacy compliance

## Phase 1 (Now): Security + Data Integrity Foundation

1. Run SQL: `database/security_phase1_hardening.sql`
2. Run SQL: `database/fix_product_update_rls_policy.sql`
3. Confirm pgcrypto is enabled (`gen_salt`/`crypt` available)
4. Verify user add/edit works from UI
5. Verify inventory constraints reject negative stock/reorder
6. Confirm `audit_log` table is queryable and insertable for authenticated sessions

## Phase 2: POS and Inventory Transaction Safety

1. Wrap sale posting in atomic transaction (header, lines, payment, stock log)
2. Enforce stock availability at DB layer before deduction
3. Add explicit stock movement reason validation in all write paths
4. Add low-stock notifications for reorder threshold breaches

## Phase 3: Analytics Reliability

1. Define prediction cadence (daily/weekly)
2. Persist forecast metrics (MAPE/MAE) by product/category
3. Add forecast-vs-actual dashboards
4. Add sparse-data fallback behavior

## Phase 4: Promotion Optimization Governance

1. Keep promotions limited to sellable inventory (already implemented in UI)
2. Track recommendation acceptance/rejection
3. Track promo uplift (baseline vs promo period)
4. Add promo end/expiry auto-status job

## Phase 5: Privacy and Compliance Controls

1. Finalize least-privilege RLS policies per table and role
2. Add retention policy for customer PII and logs
3. Add data subject delete/anonymize workflow
4. Add formal access audit reports (weekly/monthly)

