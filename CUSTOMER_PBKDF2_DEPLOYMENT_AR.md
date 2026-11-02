# Customer PBKDF2 repair — deployment order

This change keeps the existing `pbkdf2$iterations$salt$hash` database format and the 310,000-round SHA-256 work factor. It does not rewrite, delete, or migrate customer records.

## What changed

- The Cloudflare API Worker delegates PBKDF2 hash and verify operations to the private Supabase Edge Function `customer-password`.
- The Edge Function uses WebCrypto PBKDF2-SHA-256, matching the previous Node PBKDF2 output format.
- The function uses the Supabase `sb_secret_` key only in the `apikey` header. Because this key is not a JWT, `verify_jwt` is disabled for this function and a separate high-entropy `CUSTOMER_PASSWORD_SERVICE_SECRET` is checked inside the function. Both checks are required.
- Legacy plaintext/SHA-256 verification remains in the Worker and is upgraded to the existing PBKDF2 format after a successful login/reset.

## Required deployment order

**Do not deploy the Worker change before the Edge Function is deployed and tested.** Otherwise registration, login, and password recovery will return a server error while the function endpoint is missing.

1. Deploy `supabase/functions/customer-password/index.ts` to project `xdsbnmtthvqgdlytwpes` with the included `supabase/config.toml` setting:
   ```sh
   supabase secrets set CUSTOMER_PASSWORD_SERVICE_SECRET='<locally-generated-secret>' --project-ref xdsbnmtthvqgdlytwpes
   supabase functions deploy customer-password --project-ref xdsbnmtthvqgdlytwpes
   ```
2. Generate a new random secret of at least 32 bytes locally. Set the exact same value as the Supabase Edge Function secret `CUSTOMER_PASSWORD_SERVICE_SECRET` and as a Cloudflare Worker secret with the same name. Never paste it into chat, source control, or browser code. Keep the existing `SUPABASE_SERVICE_ROLE_KEY` secret; it must contain the Supabase `sb_secret_` key.
3. Confirm the function has `verify_jwt = false`. The function still rejects requests without the separate internal secret. The Worker sends the Supabase secret key in `apikey` and the shared secret in `x-td-internal-key` (not as a Bearer JWT).
4. Test the deployed function server-side: hash must return `pbkdf2$310000$...`; same-password verify must return `valid: true`; wrong-password verify must return `valid: false`. Never paste either secret into chat or the browser.
5. Only after all hosted tests succeed, merge this branch so the Cloudflare Worker update can deploy. Keep the function deployed before the Worker rollout.

## Compatibility test

Run the repository test with Node.js 20+:

```sh
node --test tests/pbkdf2-compat.test.mjs
```

This checks that WebCrypto PBKDF2-SHA-256 produces the same 32-byte output as Node's existing PBKDF2 implementation for 310,000 rounds. A hosted Supabase invocation is still required to verify the deployed runtime and its CPU budget.

## Rollback

If the hosted function test fails, do not merge/deploy the Worker change. The currently deployed Worker remains untouched, and all existing customer hashes remain unchanged.
