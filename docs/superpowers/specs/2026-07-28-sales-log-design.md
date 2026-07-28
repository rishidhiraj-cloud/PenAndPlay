# Sales Log (Analyse Sales — Phase 1) — Design Spec

## Problem

The shop's itemized sales are recorded only in a handwritten diary (date-wise, one line per item sold with its amount). There's no digital, queryable record of what's actually being sold, so no analysis of sales by item/trend/etc. is possible today.

## Scope note

"Analyse Sales" is being built in two phases:

- **Phase 1 (this spec):** capture the diary data into a database — photo upload, AI-OCR extraction, human review/correction, storage. Ships as a page called **"Sales Log"**.
- **Phase 2 (future, separate spec):** analysis/charts/trends over the captured `sales_log` data, once there's real data to design against. Will likely be the page actually called "Analyse Sales."

This spec covers Phase 1 only.

## Goal

A new page where you select a date, upload one or more photos of that date's diary page(s), get AI-extracted `{item, amount}` lines back, review/correct them in an editable table, and save the confirmed rows to a new `sales_log` table. Saved entries are viewable, editable, and deletable afterward via a month-scoped history list.

## Why a serverless function is required (new architecture for this app)

Every existing page in this app calls Supabase directly from browser JS using the public anon key — appropriate because that key is designed to be exposed client-side. An LLM API key is not: it must never reach the browser. This feature therefore introduces this app's first server-side code: a Vercel Function (the project is already linked to Vercel; adding an `api/` directory needs no extra deployment config) that holds the Anthropic API key and proxies the OCR call.

## Database

```sql
CREATE TABLE sales_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_date DATE NOT NULL,
    item TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sales_log_date ON sales_log(entry_date DESC);

ALTER TABLE sales_log DISABLE ROW LEVEL SECURITY;
```

- `item` is free text — no fixed product catalog to validate against (confirmed: item names vary/aren't from a fixed list).
- No link to `daily_entries`/`expenses`/Statement — this is a standalone itemized record, deliberately decoupled from the cash-register/ledger system (confirmed: no reconciliation).
- No image reference column — diary photos are never persisted (see below), so there's nothing to link to.

## Image handling — no storage, no retention

Diary photos are used only transiently:

1. Browser reads each selected photo, resizes/compresses it (same approach as `expense.js`'s `compressImage()` for receipts), and converts it to a base64 data string.
2. Base64 image(s) are sent directly in the request body to `/api/ocr-sales` — never uploaded to Supabase Storage or any other persistent location.
3. The serverless function passes the base64 image data directly to Claude's vision API as part of the request, gets the extraction result, and returns it. The image data is not written anywhere by the function; it exists only in request memory for the duration of that HTTP call.

Nothing needs to be cleaned up after — there's nothing left to clean up.

## `/api/ocr-sales` — the serverless function

**Request:** `POST { images: string[] }` — array of base64 data URLs (e.g. `data:image/jpeg;base64,...`), one per uploaded diary photo for the date currently being logged.

**Behavior:**
1. For each image, call the Claude API (Messages endpoint, vision-capable model) with the image content block and a prompt instructing it to:
   - Read the handwritten diary page
   - Return ONLY a JSON array of `{"item": string, "amount": number}` — one entry per sale line identified
   - Omit/skip any line that's illegible rather than guess at it
   - Return `[]` if no sale lines can be identified at all
2. Process all images in parallel (`Promise.all`) to keep total latency down — each image is an independent Claude call.
3. Strip markdown code-fence wrapping (```json ... ```) if present before `JSON.parse`-ing each response, since models commonly wrap JSON output that way even when told not to.
4. Merge all images' extracted lines into one flat array.
5. Respond `{ lines: [{item, amount}, ...] }`.
6. If the Claude API call itself fails (network, auth, rate limit) for a given image, that image's contribution is an empty array plus a logged server-side error — one bad image shouldn't fail the whole batch.

**Auth/trust model:** This endpoint has no authentication of its own (matching this app's existing trust model — Supabase tables are similarly unauthenticated beyond a client-side passkey gate). Accepted for a single-shop internal tool; not a new gap this feature introduces, but worth naming: anyone who could reach this URL could trigger Anthropic API usage on your key.

**Config:** `ANTHROPIC_API_KEY` read from a Vercel environment variable, set via the Vercel dashboard or CLI — never committed to the repo, never sent to the client.

## The page — `sales_log.html` + `sales_log.js`

Follows the existing page skeleton (header, burger menu, month indicator, footer scripts) like every other page.

### Capture flow

1. **Date picker** — defaults to today. Chosen once per upload batch; applied to every row saved from that batch (confirmed: you pick the date in the UI, not from the image).
2. **Photo upload** — `<input type="file" accept="image/*" multiple>`, one or more diary-page photos for that date.
3. **"Extract Sales" button** — compresses each image client-side, base64-encodes it, POSTs to `/api/ocr-sales`, shows a loading state (this can take several seconds per image).
4. **Editable review table** — renders the returned lines, each as an editable `item` text field + `amount` number field, with a ✕ button per row to discard it, and a "+ Add row" button for anything OCR missed entirely. Nothing is saved yet at this point.
5. **"Save Sales Log" button** — inserts every remaining row (with the chosen date attached) into `sales_log` in one batch insert. On success, clears the form back to step 1 and shows a success message.

### History section

Below the capture flow, same "scoped to the app-wide selected month" convention as every other page:

- Lists saved `sales_log` entries for the visible month, grouped by date, each showing item + amount.
- **Edit**: swaps a row into editable inputs with Save/Cancel (new UI pattern for this app — no existing page has inline edit yet, all existing history views are either add-only or delete-only).
- **Delete**: removes a row immediately, no undo — matches `history.html`'s existing delete-confirmation pattern.
- Running total for the visible month.

## Out of scope (Phase 1)

- Analysis, charts, trends, natural-language Q&A over `sales_log` — that's Phase 2.
- Any reconciliation against `daily_entries`/Statement totals.
- A fixed item/product catalog or item-name normalization/autocomplete.
- Persisting diary page photos anywhere.
- Authentication on the `/api/ocr-sales` endpoint beyond the app's existing client-side passkey gate.
