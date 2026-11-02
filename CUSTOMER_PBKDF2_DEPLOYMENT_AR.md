# Customer PBKDF2 repair — deployment order

This change keeps the existing `pbkdf2$iterations$salt$hash` database format and the 310,000-round SHA-256 work factor. It does not rewrite, delete, or migrate customer records.

## What changed

- The Cloudflare API Worker delegates PBKDF2 hash and verify operations to the private Supabase Edge Function `customer-password`.
- The Edge Function uses WebCrypto PBKDF2-SHA-256, matching the previous Node PBKDF2 output format.
- The function requires a gateway-validated JWT and additionally checks the `service_role` claim. Do not remove either check.
- Legacy plaintext/SHA-256 verification remains in the Worker and is upgraded to the existing PBKDF2 format after a successful login/reset.

## Required deployment order

**Do not deploy the Worker change before the Edge Function is deployed and tested.** Otherwise registration, login, and password recovery will return a server error while the function endpoint is missing.

1. Deploy `supabase/functions/customer-password/index.ts` to project `xdsbnmtthvqgdlytwpes` with the included `supabase/config.toml` setting:
   ```sh
   supabase functions deploy customer-password --project-ref xdsbnmtthvqgdlytwpes
   ```
2. Confirm the function is deployed with JWT verification enabled. The Cloudflare Worker already has the server-side `SUPABASE_SERVICE_ROLE_KEY`; no new browser key or client-side secret is required.
3. Test the function through a server-side request using the existing service-role key. A hash request must return a `pbkdf2$310000$...` string; verifying it with the same password must return `valid: true`; a wrong password must return `valid: false`. Never paste the service-role key into chat or the browser.
4. Only after step 3 succeeds, merge this branch so the Cloudflare Worker update can deploy. Keep the function deployed before the Worker rollout.

## Compatibility test

Run the repository test with Node.js 20+:

```sh
node --test tests/pbkdf2-compat.test.mjs
```

This checks that WebCrypto PBKDF2-SHA-256 produces the same 32-byte output as Node's existing PBKDF2 implementation for 310,000 rounds. A hosted Supabase invocation is still required to verify the deployed runtime and its CPU budget.

## Rollback

If the hosted function test fails, do not merge/deploy the Worker change. The currently deployed Worker remains untouched, and all existing customer hashes remain unchanged.
