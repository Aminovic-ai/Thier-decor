# Thier Décor POS — isolated staging test plan

Status: preparation only. This document does not authorize production SQL, secrets changes, deployment, or merging.

## Safety gate

1. Create two disposable Supabase projects in the same region: one cloned from the store schema and one cloned from the POS schema. Use synthetic products/customers only.
2. Confirm the store clone has the required `products` columns and the existing web-order stock RPC behavior. Confirm the POS clone has the three existing POS tables, constraints, RLS, and grants.
3. Run `POS_STORE_STOCK_OPERATION_MIGRATION_REVIEW.sql` ONLY on the disposable store clone.
4. Run `POS_DATABASE_MIGRATION_REVIEW.sql` ONLY on the disposable POS clone.
5. Use a staging-only Worker with staging-only service-role secrets and a staging-only Firebase admin identity. Never point it at either production project.
6. Stop immediately if schema, function ownership, grants, or product semantics differ from the reviewed assumptions.

## Synthetic fixtures

Create:
- Product A: regular product, price 100, cost 40, stock 20.
- Product B: regular product, price 50, cost 20, stock 20.
- Pack P: price 300, cost 120, stock 5, with packItems containing 2 units of A and 1 unit of B.

Record the initial stock values before each test. Use a fresh UUID request_key per independent sale. A retry must reuse the exact same request_key and payload.

## Test matrix and pass criteria

| ID | Scenario | Action | Pass criteria |
|---|---|---|---|
| T01 | Regular sale | Sell 2 × A | One POS invoice and one line; A decreases by 2; invoice totals equal 200. |
| T02 | Pack sale | Sell 1 × P | P decreases by 1, A by 2, B by 1, matching the existing web-order pack semantics; invoice preserves pack snapshot. |
| T03 | Insufficient stock | Request more A than available | RPC fails; no invoice; no stock row changes; no ledger operation is committed. |
| T04 | Duplicate submit | Submit identical request twice with the same key | Same stock operation and same invoice returned; stock decreases only once. |
| T05 | Key misuse | Reuse a committed key with a changed payload | Request is rejected; no additional stock change or invoice. |
| T06 | Different key / same operation | Attempt to link one stock operation to another invoice key | POS RPC rejects it; no second invoice. |
| T07 | Concurrent POS sales | Two sessions compete for the final available units | At most one succeeds; no negative stock; successful invoice count matches successful stock operations. |
| T08 | Web/POS concurrency | Run a web order and POS sale against overlapping stock | Both complete or one fails cleanly; no negative stock, duplicate deduction, or deadlock left unresolved. Retry only with the same POS key. |
| T09 | Product edit race | Change price/cost/name/packItems between initial read and row-lock validation | POS stock RPC aborts with configuration-changed retry message; retry with same key and fresh payload succeeds at most once. |
| T10 | Timeout after stock commit | Allow store RPC to commit, then simulate loss of its HTTP response | Retry with identical key returns the existing ledger operation; stock is not deducted again; invoice is eventually written. |
| T11 | POS database outage | Disable/unreachable POS staging DB after stock commit | Worker returns pending; ledger remains; restore POS DB and retry/recover; exactly one invoice appears. |
| T12 | Timeout after invoice commit | Commit POS invoice but simulate lost response | Retry returns the same invoice; no duplicate invoice or stock change. |
| T13 | Browser refresh | Save pending sale, refresh browser, resume | Same saved payload/key is reused; never create a new sale key for the pending operation. |
| T14 | Browser storage lost | Clear local storage after stock commit | Admin recovery finds the orphan ledger operation and creates exactly one invoice. |
| T15 | Recovery batching | Seed more than 50 orphan operations | One recovery run processes at most 50; subsequent runs continue; no operation is invoiced twice. |
| T16 | Invoice validation | Submit bad totals, fractional quantity, negative cost, unsupported payment method, or malformed line | RPC rejects the invoice transaction; no partial sale or line rows remain. |
| T17 | RLS / privilege | Attempt table reads/writes and RPC calls as anon/authenticated | No direct access; only service_role can execute privileged POS RPCs. |
| T18 | Existing POS history | Run additive migration with existing synthetic sales | Existing rows and invoice numbers remain unchanged; new indexes/columns/functions install successfully. |

## Required SQL assertions after each successful sale

- Exactly one `pos_sales` row for the request_key and exactly one row for the stock_operation_id.
- The sum of `pos_sale_items.line_total` equals `pos_sales.subtotal`.
- `pos_sales.total = subtotal - discount`.
- Item name, unit price, unit cost, quantity, pack flag, and pack snapshot are sale-time snapshots.
- Stock deltas equal the expected aggregate of sold products plus pack components.
- No negative product quantity and no duplicate request_key / stock_operation_id.

## Final acceptance gate

Do not merge until all tests T01–T18 pass on disposable projects, test evidence (before/after stock, invoice rows, ledger rows, and relevant logs) is recorded, and the Worker code is reviewed against the exact tested migration versions. Production migrations, Cloudflare secrets, Worker deployment, Pages deployment, and merge each require separate explicit approval.
