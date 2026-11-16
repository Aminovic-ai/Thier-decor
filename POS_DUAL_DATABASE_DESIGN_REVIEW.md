# Thier Décor POS — Dual Supabase Database Design

Status: review design only. No production SQL, Worker deployment, Pages deployment, or merge is authorized by this document.

## Fixed architecture

- Store Supabase project (`xdsbnmtthvqgdlytwpes`) remains the sole source of truth for products, prices, costs, pack composition, and stock quantities.
- POS Supabase project (`obxjemvuympyddckghom`) stores in-store POS invoices, immutable sale-line snapshots, customer details captured on the invoice, payment records, and POS sales/profit reporting data.
- Store operating expenses remain exclusively in the existing store Supabase project. Do not copy or migrate expenses into POS.
- The Cloudflare Worker is the only application component allowed to use either service-role key. Browser code must never receive either key.
- The Worker uses the existing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` pair for the store database and a separate `POS_SUPABASE_URL` / `POS_SUPABASE_SERVICE_ROLE_KEY` pair for POS.
- The POS key setting may contain either the legacy `service_role` JWT or the new `sb_secret_*` key. For the new opaque secret key, send it in the `apikey` header only; do not send it as `Authorization: Bearer` because it is not a JWT.
- No inventory mirror or copied stock table is created in POS.

## Cross-database consistency model

PostgreSQL cannot provide one atomic transaction spanning two independent Supabase projects. The POS flow therefore uses a retryable saga with a durable idempotency key.

1. The authenticated admin submits a sale with a client-generated UUID `request_key`. The Worker validates the Firebase admin identity.
2. The Worker reads current product rows from the store database and builds canonical sale-line snapshots using trusted database values only. Browser-supplied names, prices, costs, pack flags, or pack components are ignored.
3. The Worker calls a store-database RPC to commit the stock deduction. That RPC:
   - serializes requests by `request_key`;
   - returns the prior result if the key has already committed;
   - locks all required stock rows in ascending product-id order;
   - expands packs from the current database `isPack` / `packItems` definitions;
   - validates positive integral quantities and stock availability;
   - writes a durable stock-operation record and decrements component quantities in the same local transaction.
4. The Worker calls a POS-database RPC with the same `request_key`, the stock-operation identifier, canonical line snapshots, and validated totals. That RPC inserts the invoice and all line items atomically. A unique `request_key` makes retries return the same invoice.
5. If the POS database is temporarily unavailable after stock deduction, the Worker returns a recoverable/pending result. Retrying with the exact same key does not deduct stock again and completes invoice recording when POS is available.
6. A stock operation is never automatically released merely because an HTTP request timed out: the POS write may have succeeded while its response was lost. Any compensation/release path must first prove that no POS invoice exists for the same key and must be an explicit, audited admin recovery action.

## Important business rules

- Pack stock is deducted from component products using the live pack definition. For example, a pack containing 5 units of component A and 5 units of component B consumes 5 of each per pack sold.
- A sale line stores immutable product id, product name, quantity, unit price, unit cost, pack snapshot, and line total at sale time. Reports must not depend on today's product name or price.
- Discounts and payment amounts are validated server-side. A POS sale is not a customer web order and must not call `td_create_order` or consume web promo codes.
- Store expenses remain in the old store database and continue using the existing expense workflow. POS reports cover in-store sales and item margin/discounts only; do not copy, migrate, or subtract store expenses in POS.
- POS tables remain RLS-enabled with no public/anon/authenticated policies. Service-role access is server-side only.
- Use integer quantities for stock and pack component quantities, matching `products.qty integer`. Money uses numeric precision and rounding rules consistently.

## Current verified schema facts

Store database:
- `products.id` is `bigint`; `products.qty` is `integer`.
- `price` and `cost` are `numeric`.
- `isPack` is `boolean`; `packItems` is `jsonb`.
- Observed pack JSON shape: `[{"id": 1792956904993, "qty": 5}, {"id": 1792956946527, "qty": 5}]`.
- Existing `td_create_order` expands packs and deducts stock for web orders, but it has no idempotency key and is not to be reused as the POS stock RPC.
- Existing order-cancellation logic refuses automatic stock restoration for packs. POS recovery must not assume the cancellation function is suitable.

POS database:
- Existing tables: `pos_sales`, `pos_sale_items`, `pos_expenses`.
- `pos_sales.invoice_no` has a unique constraint; `pos_sale_items.sale_id` references `pos_sales(id)` with cascade delete.
- RLS is enabled on all three tables; no policies were returned by `pg_policies`.
- Existing table grants revoke anon/authenticated and grant service_role.
- These tables must be evolved with additive migrations, not dropped/recreated.

## Required implementation and validation before merge

1. Add review-only, separately scoped migrations: one for the store stock-operation ledger/RPC and one for POS idempotency/state/sale RPC and reporting indexes.
2. Review all current constraints, grants, function ownership, and RPC execute privileges in both projects.
3. Implement separate Worker REST/RPC helpers for store and POS. Never fall back from missing POS configuration to the store database.
4. Validate the Worker payload against trusted store product rows; reject stale/invalid pack definitions and fractional stock quantities.
5. Ensure the same `request_key` is retained by the UI until the sale is definitively completed. Do not generate a new key on a network retry.
6. Implement POS invoice history and POS-only sales/profit summaries from the POS database; keep expense CRUD pointed at the old store database.
6. Test: normal product sale, pack sale, insufficient stock, duplicate submit, timeout after stock commit, timeout after POS commit, POS outage/retry, concurrent sales competing for the last units, and invoice printing.
7. Confirm no changes to web checkout, customer orders, R2 image handling, production Worker, or live Pages.
8. Only after review and explicit approval: apply POS migration to the POS project, apply store migration to the store project, add the two POS secrets in Cloudflare, test on a non-production Worker environment, then manually deploy only when the user requests it.

## Explicit non-actions

- Do not run either migration against production as part of branch preparation.
- Do not add or rotate secrets through GitHub.
- Do not deploy the Worker or Pages.
- Do not merge PR #55 or this branch automatically.
