# StellarDrive — Salesforce Integration

Phase 1 scope: connect orgs via browser OAuth, fetch/persist metadata, create custom fields / objects / permission sets and SObject records. No updates, no deletes.

## Connected App

StellarDrive uses a **Salesforce Connected App** you provision in a Salesforce org you control (the "platform" org — not the user's org). The Connected App is configured once, then every user's connection routes through it.

**Required settings**:

- OAuth Scopes: `Access the Salesforce API (api)`, `Perform requests at any time (refresh_token, offline_access)`, `Access the identity URL service (id, profile, email, address, phone)`.
- Callback URL: `${APP_URL}/api/salesforce/oauth/callback` (e.g. `http://localhost:3000/api/salesforce/oauth/callback` for dev).
- Require Proof Key for Code Exchange (PKCE): enabled.
- Client credentials are stored as `SALESFORCE_CLIENT_ID` + `SALESFORCE_CLIENT_SECRET` in `.env.local`.

## Org-type selection

Salesforce hosts different org types at different login hosts:

| user choice       | host                             |
|-------------------|----------------------------------|
| Production        | `https://login.salesforce.com`   |
| Sandbox           | `https://test.salesforce.com`    |
| Developer Edition | `https://login.salesforce.com`   |
| Custom Domain     | `https://<my-domain>.my.salesforce.com` (user supplies) |

The user picks one in the **Connect org** dialog. After the token exchange, we query `/services/data/vXX.X/sobjects/Organization/<id>` and read `OrganizationType` (`Developer Edition`, `Production`, `Trial`, `Demo`, `Base Edition`, …). The persisted `org_type` is derived from that server-side answer — the user's choice only decides which host we hit first.

## OAuth flow

1. **User clicks "Connect org"** in the dashboard; picks an org type (and optionally a My Domain host).
2. **Client → `GET /api/salesforce/oauth/authorize?loginHost=...`**.
   - The route handler generates a PKCE `code_verifier`, `code_challenge` (S256), and a random `state`.
   - It sets an HttpOnly, short-lived (10 min) signed cookie with `{ state, code_verifier, login_host, user_id }`.
   - It redirects the browser to `{login_host}/services/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...&scope=api refresh_token offline_access id&state=...&code_challenge=...&code_challenge_method=S256`.
3. **User authenticates on Salesforce** and approves the connected app.
4. **Salesforce redirects** to `/api/salesforce/oauth/callback?code=...&state=...`.
5. **Callback handler**:
   - Loads the state cookie, verifies `state` matches, clears the cookie.
   - Confirms the currently-logged-in Supabase user id equals the cookie's `user_id` (defense in depth).
   - Exchanges the code at `{login_host}/services/oauth2/token` with `grant_type=authorization_code` and `code_verifier`. Receives `{ access_token, refresh_token, instance_url, id, issued_at, signature }`.
   - Calls `{instance_url}/services/oauth2/userinfo` and `{instance_url}/services/data/vXX.X/sobjects/Organization/<id>` to collect org id, name, and type.
   - Encrypts both tokens with AES-256-GCM and a unique 12-byte IV per field.
   - Upserts `connected_salesforce_orgs` (`on conflict (user_id, sf_org_id) do update`).
   - Writes an `audit_logs` row (`action_type = 'org.connected'`).
   - Redirects to `/dashboard/orgs/{id}`.

## Token lifecycle

- **Access tokens** are short-lived (default 2 h). The DB stores `expires_at` with a 60 s skew applied on read.
- **Refresh tokens** are long-lived and are used to mint new access tokens.
- **`getSalesforceConnection(orgId)`** (in `lib/salesforce/connection.ts`) is the only way the rest of the app talks to Salesforce. It:
  1. Loads the org row (subject to RLS).
  2. Decrypts both tokens.
  3. If `now() + skew >= expires_at`, POSTs `{login_host}/services/oauth2/token` with `grant_type=refresh_token` to mint a new access token.
  4. Re-encrypts and persists the new access token + `expires_at`.
  5. Returns a `jsforce.Connection` with the fresh `accessToken` and `instanceUrl` set.
- **Revocation** (future): if Salesforce returns `invalid_grant` on refresh, we mark the org `status = 'revoked'` and surface a reconnect prompt in the UI.

## Metadata fetch strategy

### Objects + fields

- Use `conn.describeGlobal()` to list SObjects.
- For each (throttled, chunked — 20 parallel max) call `conn.sobject(name).describe()` to get fields.
- Persist summaries to `salesforce_metadata_objects` + `salesforce_metadata_fields`. `summary` jsonb contains a trimmed subset of the describe; the full raw describe is not stored (it's huge and can be re-fetched).

### Apex classes

- Use the Tooling API: `conn.tooling.query("SELECT Id, Name, ApiVersion, Status, Body FROM ApexClass")`.
- Compute `body_hash = sha256(body)` and persist to `salesforce_metadata_classes`. Store the **hash**, not the body, so we can detect changes without bloating the DB. Bodies can be re-fetched on demand.

### Scope and throttling

- Phase 1 defaults:
  - Objects describe: all SObjects.
  - Fields describe: top N customizable + all custom objects, or the full set when `?full=1` is passed. (Starter scaffold uses the full set but marks this as a tuning TODO.)
  - Apex classes: all.
- Respect `Sforce-Limit-Info` headers; abort cleanly if API usage is above 90 %.

## Refresh flow

- User clicks "Refresh metadata" → `POST /api/salesforce/metadata/sync` with `{ orgId, kind }`.
- Handler inserts a `metadata_sync_jobs` row (`status=pending`), then in Phase 1 runs the sync inline in the same request (Phase ≥ 2: dispatch to a background queue).
- Progress is reflected on the sync job row; the UI polls it or receives it via Supabase Realtime.

## Separation of concerns

| module                          | responsibility                                                  |
|---------------------------------|-----------------------------------------------------------------|
| `lib/salesforce/oauth.ts`       | Build authorize URLs, PKCE, state cookie helpers.               |
| `lib/salesforce/connection.ts`  | `getSalesforceConnection(orgId)` with transparent token refresh.|
| `lib/salesforce/metadata.ts`    | Read-only describe / list.                                      |
| `lib/salesforce/metadata-deploy.ts` | Metadata API CREATE deploys (CustomField, CustomObject, PermissionSet). |
| `lib/salesforce/records.ts`     | SObject CREATE DML.                                             |
| `lib/salesforce/types.ts`       | Shared TS types mirroring SF API shapes we care about.          |

The metadata-deploy module uses the **Metadata API** (`conn.metadata.create(...)`) — it does _not_ reuse the SObject DML path, because creating a custom field is a metadata deploy, not a record insert.

## Security notes

- Tokens never leave the server. The only place tokens are touched is `lib/salesforce/connection.ts` and `lib/salesforce/oauth.ts`, both server-only.
- `TOKEN_ENCRYPTION_KEY` must be a 32-byte value (base64 encoded in env). The encryption helper rejects any other key size.
- Each token field has its own 12-byte IV; IVs are stored alongside the ciphertext and are non-secret by design.
- The state cookie is HttpOnly, Secure (in prod), SameSite=Lax, and scoped to `/api/salesforce/oauth/`.
