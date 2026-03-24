# PrecificaApp Security Review Report

**Date:** 2026-03-23
**Scope:** Read-only code review of src/ directory
**Reviewer:** Automated security analysis
**Application:** React Native + Expo (web) with Supabase backend

---

## Executive Summary

The application has a solid security foundation with RLS enabled on all tables, proper use of environment variables for credentials, and recently-added `escapeHtml()` coverage on HTML exports. However, several medium-to-high severity issues remain, primarily around cache isolation on logout, subscription table self-service mutations, and the SQL parser's incomplete coverage of the Supabase API surface.

**Findings by severity:**
- CRITICAL: 1
- HIGH: 3
- MEDIUM: 5
- LOW: 3

---

## CRITICAL

### C1. Supabase Anon Key Committed in .env File

**File:** `.env` (line 2)
**Description:** The `.env` file contains the live Supabase anon key (`eyJhbGciOiJIUzI1NiIs...`). While `.env` is listed in `.gitignore`, the file exists on disk and this is NOT a git repository. If this directory is ever committed to version control, shared, or backed up to cloud storage, the key is exposed. The anon key is a public-facing key by design (used in the browser), but it still grants full API access scoped by RLS policies. Combined with finding H1 below, an exposed anon key becomes more dangerous.

**Attack scenario:** If the repository is ever pushed to a public GitHub repo or shared via zip, the Supabase URL and anon key are immediately available. An attacker could directly call the Supabase REST API.

**Risk:** The anon key is designed to be public (used client-side), so the real risk depends on RLS policy correctness. Given the subscription table issue (H1), this elevates to CRITICAL.

**Suggested fix:**
- Verify `.env` is never committed. Since this is not a git repo yet, ensure `.gitignore` is in place before any `git init`.
- The `.env.example` file should contain placeholder values only (verify it does not contain real keys).
- Consider rotating the anon key if this directory has been shared.

---

## HIGH

### H1. Subscription Table Has Full CRUD Policies -- Users Can Self-Upgrade Plans

**File:** `src/database/supabase-schema.sql` (lines 296-317)
**Description:** The schema applies identical RLS policies to ALL tables including `subscriptions`: SELECT, INSERT, UPDATE, DELETE all allowed where `auth.uid() = user_id`. This means any authenticated user can directly call the Supabase API to UPDATE their own subscription row and change `plan` from `'free'` to `'profissional'`, or modify `status` and `expires_at`.

The SQL CHECK constraint (`plan IN ('free', 'essencial', 'profissional')`) only validates that the value is one of the allowed strings -- it does not prevent a user from choosing a paid plan without paying.

**Attack scenario:**
```
// From browser console or any HTTP client with the user's JWT:
supabase.from('subscriptions').update({ plan: 'profissional', status: 'active', expires_at: '2099-12-31' }).eq('user_id', '<my-user-id>')
```

**Suggested fix:**
- Remove UPDATE, INSERT, and DELETE policies from the `subscriptions` table for regular users.
- Only allow SELECT for users on their own row.
- All subscription mutations should go through a server-side function (Supabase Edge Function or webhook from Stripe) using a service role key.

---

### H2. Cache Not Cleared on Logout -- Cross-User Data Leakage

**File:** `src/database/supabaseDb.js` (lines 10-32) and `src/contexts/AuthContext.js` (line 41-43)
**Description:** The `queryCache` in `supabaseDb.js` is a module-level `Map` that persists in memory. When a user signs out via `signOut()` in `AuthContext.js`, neither `resetDatabase()` nor `invalidateCache()` is called. The `resetDatabase()` function exists in `database.js` (line 26) but is never invoked from the sign-out flow.

If User A signs out and User B signs in on the same device/browser session, User B could receive cached query results from User A's session (within the 5-second TTL window, or longer if the cache hasn't been garbage collected).

Additionally, the `currentUserId` module variable in `supabaseDb.js` (line 8) is only updated when `createSupabaseDb()` is called, but the old cache entries remain.

**Attack scenario:** On a shared device, User A views their pricing data, signs out. User B signs in within seconds. If User B triggers the same queries, they may receive User A's cached results.

**Suggested fix:**
- Call `resetDatabase()` inside `signOut()` in `AuthContext.js`.
- Have `resetDatabase()` also call `invalidateCache()` (or clear `queryCache` directly).
- Clear `currentUserId` on sign-out.

---

### H3. SQL Parser Allows Arbitrary Table Name Access

**File:** `src/database/supabaseDb.js` (lines 74-86, 126-138, 147-183, 186-203)
**Description:** The SQL parser extracts table names from SQL strings using regex (e.g., `FROM (\w+)`) and passes them directly to `supabase.from(table)`. There is no allowlist of valid table names. While RLS on the server side prevents cross-user data access, there is no client-side validation that the table name is one of the expected application tables.

If any code path constructs SQL with user-influenced table names (even indirectly), an attacker could query any table in the Supabase project, including `subscriptions`, `auth`-related tables, or any other table accessible via the anon key.

Currently, all SQL strings appear to be hardcoded in the application code, so exploitation requires finding a code path where user input flows into SQL construction. The risk is elevated because the SQL-to-Supabase translation layer is a novel attack surface.

**Suggested fix:**
- Add a table name allowlist in `executeQuery()` and `executeRun()`:
  ```js
  const ALLOWED_TABLES = new Set(['produtos', 'materias_primas', 'preparos', ...]);
  if (!ALLOWED_TABLES.has(table)) throw new Error('Invalid table: ' + table);
  ```

---

### H4. No Rate Limiting on Authentication Endpoints

**File:** `src/screens/LoginScreen.js` (lines 13-31), `src/screens/ForgotPasswordScreen.js` (lines 13-27)
**Description:** There is no client-side rate limiting or account lockout logic on login attempts or password reset requests. While Supabase provides some built-in rate limiting on its auth endpoints, the client makes no effort to throttle repeated failed attempts.

**Attack scenario:** An attacker could script rapid brute-force login attempts against the Supabase auth endpoint. Depending on Supabase project configuration, this may or may not be mitigated server-side.

**Suggested fix:**
- Add client-side throttling (e.g., exponential backoff after 3 failed attempts).
- Verify Supabase project has rate limiting enabled on auth endpoints.
- Consider adding CAPTCHA after N failed attempts.

---

## MEDIUM

### M1. Numeric Values Injected Into HTML Without Escaping

**File:** `src/screens/ExportPDFScreen.js` (lines 335, 344, 353, 438, 443, 448, 453)
**Description:** Several numeric values from the database are interpolated directly into HTML template strings without passing through `escapeHtml()`. Examples:
- `${i.quantidade_utilizada || 0}` (line 335)
- `${p.quantidade_utilizada || 0}` (line 344)
- `${e.quantidade || 1}` (line 353)
- `${Math.min(cmvPerc * 100, 100)}%` (line 438)

While these values are expected to be numeric (REAL type in the database), if a database value were somehow set to a string containing HTML/JS, it would be rendered without sanitization. The `|| 0` fallback only applies if the value is falsy, not if it's a malicious string.

**Attack scenario:** If a database column expected to be REAL contained a string (e.g., via direct DB manipulation or API abuse), it could inject HTML into the exported PDF document.

**Suggested fix:**
- Wrap all interpolated values in `escapeHtml(String(value))` or ensure numeric coercion via `Number(value)` before interpolation.
- The `fmtCur()` and `fmtPct()` functions already call `Number(v)`, so values passed through them are safe.

---

### M2. `formatCurrency` Output Used in `document.write()` Without Escaping

**File:** `src/screens/ListaComprasScreen.js` (line 232, 239-240)
**Description:** The `formatCurrency()` function returns a string like `R$ 1.234,56`. This output is injected directly into HTML via template literals. While the current implementation of `formatCurrency` (in `src/utils/calculations.js` line 169-171) calls `Number(value).toFixed(2)` which guarantees a numeric string output, any future change to `formatCurrency` that includes user-supplied text (e.g., currency symbol from user preferences) could introduce XSS.

**Suggested fix:**
- Pass `formatCurrency()` output through `escapeHtml()` as a defense-in-depth measure.

---

### M3. `handle_new_user()` Trigger Uses SECURITY DEFINER

**File:** `src/database/supabase-schema.sql` (line 331)
**Description:** The `handle_new_user()` function runs with `SECURITY DEFINER` privileges. This is necessary for the trigger to insert into tables the new user doesn't yet have RLS access to. However, if this function were modified to accept or process user-controlled input, it could bypass RLS entirely. The current implementation is safe (only inserts defaults), but it requires careful maintenance.

**Suggested fix:**
- Document clearly that this function must never process user-supplied data.
- Consider auditing any future modifications to this function for privilege escalation.

---

### M4. Debug Logging Exposes SQL Queries and Errors

**File:** `src/database/supabaseDb.js` (lines 76, 115, 140, 179, 199, 222, 242)
**Description:** Multiple `console.warn` and `console.error` calls log full SQL queries and error messages to the browser console. These are guarded by `__DEV__`, but in Expo web builds, `__DEV__` may remain `true` if the build is not configured for production mode. This leaks internal query structure to anyone with browser DevTools open.

Additionally, `RegisterScreen.js` (line 34) logs registration errors: `console.error('Registration error:', err)`, which could expose internal Supabase error details.

**Suggested fix:**
- Verify that production builds set `__DEV__` to `false`.
- Remove or redact `console.error` calls that log full error objects in production.
- Consider using a logging library that respects environment configuration.

---

### M5. No Email Validation Beyond Empty Check

**File:** `src/screens/RegisterScreen.js` (line 16), `src/screens/LoginScreen.js` (line 14)
**Description:** Email inputs are only checked for being non-empty (`!email.trim()`). There is no format validation (e.g., regex for valid email format). While Supabase will reject invalid emails server-side, this means malformed input is sent over the network unnecessarily, and error messages from Supabase may be confusing to users.

**Suggested fix:**
- Add basic email format validation on the client side before submitting to Supabase.

---

## LOW

### L1. Password Complexity Not Enforced on Login (Only on Registration)

**File:** `src/screens/RegisterScreen.js` (line 20) vs `src/screens/LoginScreen.js`
**Description:** Password complexity rules (8+ chars, uppercase, lowercase, number) are enforced on registration but not on login. This is expected behavior (users with old passwords need to log in), but if password requirements were recently upgraded, existing users with weak passwords are not prompted to change them.

**Suggested fix:**
- Consider adding a post-login check that prompts users with weak passwords to update them.
- This can be done via Supabase password policies or a client-side check after successful authentication.

---

### L2. `window.open()` Return Value Not Null-Checked in ListaComprasScreen

**File:** `src/screens/ListaComprasScreen.js` (lines 245-248)
**Description:** The code calls `window.open('', '_blank')` and immediately calls `win.document.write(html)` without checking if `win` is null. Pop-up blockers may return null, causing a runtime error. The `ExportPDFScreen.js` (line 697) correctly checks `if (win)` before using it.

**Suggested fix:**
- Add a null check: `if (win) { win.document.write(html); ... }`

---

### L3. External Font Loaded From Google CDN in PDF Export

**File:** `src/screens/ExportPDFScreen.js` (line 486)
**Description:** The HTML template includes `@import url('https://fonts.googleapis.com/css2?family=DM+Sans...')`. This makes an external network request when the PDF is generated, which:
1. May fail offline, breaking PDF styling.
2. Sends a request to Google with referrer information.
3. Could theoretically be intercepted in a MITM attack to inject CSS.

**Suggested fix:**
- Bundle the font locally or use system fonts for PDF exports.
- At minimum, add `integrity` and `crossorigin` attributes if keeping the CDN reference.

---

## Verification of Previously Reported Fixes

### C1 (Previous) -- Password Complexity: VERIFIED FIXED
`RegisterScreen.js` line 20 enforces `password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)`. This correctly requires 8+ characters with uppercase, lowercase, and numeric characters.

### C4 (Previous) -- Credentials in .env: VERIFIED FIXED
`src/config/supabase.js` uses `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY`. No hardcoded credentials in source code. `.env` is in `.gitignore`.

### H2 (Previous) -- XSS via escapeHtml: PARTIALLY FIXED
Both `ExportPDFScreen.js` (line 310) and `ListaComprasScreen.js` (line 9) define `escapeHtml()` and use it for all string user data (product names, category names, preparation instructions, etc.). However, numeric values from the database are still interpolated directly (see M1 above). The fix is substantially in place but has gaps for non-string fields.

### H3 (Previous) -- escapeHtml Coverage: VERIFIED FIXED
All user-controlled string fields in HTML exports pass through `escapeHtml()`, including: product names, ingredient names, preparation names, packaging names, categories, business name, preparation instructions, and observation text.

### H4 (Previous) -- escapeHtml in ListaComprasScreen: VERIFIED FIXED
`ListaComprasScreen.js` now has its own `escapeHtml()` function (line 9) and applies it to product names (line 195), category names (line 226), item names (line 230), and display units (line 231).

---

## Summary Table

| ID | Severity | Component | Issue |
|----|----------|-----------|-------|
| C1 | CRITICAL | .env | Live Supabase anon key in .env (combined with H1) |
| H1 | HIGH | supabase-schema.sql | Subscriptions table allows user self-mutation (plan upgrade bypass) |
| H2 | HIGH | supabaseDb.js / AuthContext.js | Cache not cleared on logout; cross-user data leakage |
| H3 | HIGH | supabaseDb.js | No table name allowlist in SQL parser |
| H4 | HIGH | LoginScreen.js | No rate limiting on authentication |
| M1 | MEDIUM | ExportPDFScreen.js | Numeric DB values in HTML without escaping |
| M2 | MEDIUM | ListaComprasScreen.js | formatCurrency output not escaped in HTML |
| M3 | MEDIUM | supabase-schema.sql | SECURITY DEFINER trigger requires careful maintenance |
| M4 | MEDIUM | supabaseDb.js | Debug logging exposes SQL in dev/staging |
| M5 | MEDIUM | RegisterScreen.js | No client-side email format validation |
| L1 | LOW | LoginScreen.js | No prompt to upgrade weak legacy passwords |
| L2 | LOW | ListaComprasScreen.js | Missing null check on window.open() |
| L3 | LOW | ExportPDFScreen.js | External font CDN request in PDF export |

---

## Recommendations Priority

1. **Immediate (H1):** Remove UPDATE/INSERT/DELETE RLS policies from `subscriptions` table. This is a business logic bypass that could lead to revenue loss.
2. **Immediate (H2):** Call `resetDatabase()` in the `signOut()` flow and ensure cache is cleared.
3. **Short-term (H3):** Add table name allowlist to the SQL parser.
4. **Short-term (M1, M2):** Ensure all values in HTML templates are either escaped or coerced to safe types.
5. **Medium-term (H4):** Implement client-side rate limiting on auth forms.
6. **Before launch:** Verify production builds disable `__DEV__` logging.
