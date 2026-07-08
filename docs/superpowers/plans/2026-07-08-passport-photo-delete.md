# Passport Photo Log Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user "Dhiraj" delete a processed passport photo (Storage file + `passport_photo_log` row) directly from the photo log modal in `passport_photo_generator.html`.

**Architecture:** Single-file vanilla-JS change. The log modal's row template gains a delete button gated on `window.washiAuth.getUsername() === 'Dhiraj'`; a delegated click handler on the list container calls Supabase Storage `.remove()` then a table `.delete()`, removes the row from the DOM, and refreshes the shared counters. A companion SQL file adds the missing DELETE RLS policy the client call needs.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (already loaded via CDN in the page), Supabase Postgres RLS, plain CSS (no build step).

## Global Constraints

- No automated test framework exists in this repo (`package.json` has no test runner; `simple-test.html` / `test-connection.html` are manual browser harnesses, not automated suites). All "test" steps in this plan are manual browser verification steps, run via the project's local server per the file's own header comment: `python3 -m http.server 8765` (or `./run.command`), then visit `http://localhost:8765/passport_photo_generator.html` — never open the file directly via `file://`.
- Delete button visibility check: `window.washiAuth.getUsername() === 'Dhiraj'` exactly (case-sensitive, matches `auth.js`'s `USERS` list).
- Storage bucket name is `passport-photos` (existing constant usage, e.g. `passport_photo_generator.html:1076`).
- DB table/constant is `COUNTER_TABLE = 'passport_photo_log'` (`passport_photo_generator.html:1021`).
- Match existing code style in this file: 6-space indentation inside the `<script>` block, template literals for HTML generation, `console.warn` for non-fatal errors (not `console.error`).

---

### Task 1: Add DELETE RLS policy for `passport_photo_log`

**Files:**
- Create: `/Users/dhiraj/Documents/TestVibe/PASSPORT_PHOTO_LOG_DELETE_POLICY.sql`

**Interfaces:**
- Produces: a SQL script the user runs manually in the Supabase SQL Editor. No code-level interface — Task 3's `supabaseClient.from(COUNTER_TABLE).delete()` call depends on this policy existing in the live database before it will work.

- [ ] **Step 1: Write the SQL policy file**

Create `/Users/dhiraj/Documents/TestVibe/PASSPORT_PHOTO_LOG_DELETE_POLICY.sql` with this exact content (mirrors the existing `daily_entries` delete policy pattern in `SUPABASE_FIX.sql:41-45`):

```sql
-- ============================================================
-- Passport Photo Log — DELETE policy
-- Run this once in the Supabase SQL Editor. Without it, RLS
-- silently blocks the app's delete-image feature (Dhiraj-only).
-- ============================================================

DROP POLICY IF EXISTS "Allow public delete" ON passport_photo_log;
CREATE POLICY "Allow public delete"
    ON passport_photo_log
    FOR DELETE
    TO public
    USING (true);

-- ============================================================
-- Verify
-- ============================================================
-- SELECT * FROM pg_policies WHERE tablename = 'passport_photo_log';
-- Expect to see policies: "Allow public insert", "Allow public select",
-- "Allow public delete".
```

- [ ] **Step 2: Confirm the file matches the repo's existing SQL policy style**

Run:
```bash
diff <(grep -A4 'FOR DELETE' /Users/dhiraj/Documents/TestVibe/SUPABASE_FIX.sql) <(grep -A4 'FOR DELETE' /Users/dhiraj/Documents/TestVibe/PASSPORT_PHOTO_LOG_DELETE_POLICY.sql)
```
Expected: only the `ON <table>` line differs (`daily_entries` vs `passport_photo_log`) — confirms the policy shape (`TO public USING (true)`) matches the established pattern exactly.

- [ ] **Step 3: Tell the user to apply it manually**

This step has no code action — flag to the user (in your response, not in a file) that they must open the Supabase Dashboard → SQL Editor → paste and run `PASSPORT_PHOTO_LOG_DELETE_POLICY.sql` before Task 3's delete button will work end-to-end. Without this, Task 3's manual browser test will fail at the DB delete step with an RLS-permission error.

- [ ] **Step 4: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add PASSPORT_PHOTO_LOG_DELETE_POLICY.sql
git commit -m "Add DELETE RLS policy for passport_photo_log"
```
(If this directory is not a git repository, skip this step — confirm with `git rev-parse --is-inside-work-tree` first; if it errors, there is nothing to commit to.)

---

### Task 2: Row template — data attributes, delete button, styling

**Files:**
- Modify: `/Users/dhiraj/Documents/TestVibe/passport_photo_generator.html:230-239` (CSS, add delete button style next to `.passport-log-open`)
- Modify: `/Users/dhiraj/Documents/TestVibe/passport_photo_generator.html:1175-1198` (row template inside `openPassportLogModal`)

**Interfaces:**
- Consumes: `window.washiAuth.getUsername()` (defined in `auth.js:28`, returns the logged-in username string or `null`).
- Consumes: `escapeAttr(s)` (defined at `passport_photo_generator.html:1139-1141`, already used for `photo_url`/other attrs in this template).
- Produces: for each log row, a `<button class="passport-log-delete" data-id="..." data-photo-url="...">` element (only when the current user is Dhiraj) that Task 3's click handler binds to via delegation. Produces CSS classes `.passport-log-delete` and its dark-mode variant, and a `.passport-log-actions` wrapper class so Open + Delete lay out side by side.

- [ ] **Step 1: Add the delete button + dark-mode CSS**

In `passport_photo_generator.html`, immediately after the existing `.passport-log-open` dark-mode rule (line 239: `body.dark-mode .passport-log-open { color: #a78bfa; }`), insert:

```css
        .passport-log-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
        }
        .passport-log-delete {
            font: inherit;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: #dc2626;
            background: none;
            border: none;
            padding: 2px 0;
            cursor: pointer;
            white-space: nowrap;
        }
        .passport-log-delete:hover { color: #991b1b; text-decoration: underline; }
        .passport-log-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        body.dark-mode .passport-log-delete { color: #f87171; }
        body.dark-mode .passport-log-delete:hover { color: #fca5a5; }
```

- [ ] **Step 2: Update the row template to include data attributes, the actions wrapper, and the gated delete button**

In `passport_photo_generator.html`, replace the row-building code at lines 1175-1198:

```javascript
          passportLogList.innerHTML = data.map(row => {
            const when = formatLogWhen(row.created_at);
            const rel = relativeWhen(row.created_at);
            const hasUrl = !!row.photo_url;
            const thumb = hasUrl
              ? `<a class="passport-log-thumb-link" href="${escapeAttr(row.photo_url)}" target="_blank" rel="noopener" title="Open full photo">
                   <img class="passport-log-thumb" src="${escapeAttr(row.photo_url)}" alt="Passport photo"
                        onerror="this.outerHTML='&lt;div class=\\'passport-log-thumb-missing\\'&gt;Image<br>missing&lt;/div&gt;'">
                 </a>`
              : `<div class="passport-log-thumb-missing">No image</div>`;
            const openLink = hasUrl
              ? `<a class="passport-log-open" href="${escapeAttr(row.photo_url)}" target="_blank" rel="noopener">↗ Open</a>`
              : '';
            return `
              <div class="passport-log-item">
                ${thumb}
                <div class="passport-log-meta">
                  <span class="passport-log-when">${when}</span>
                  <span class="passport-log-when-rel">${rel}</span>
                </div>
                ${openLink}
              </div>
            `;
          }).join('');
```

with:

```javascript
          const canDelete = window.washiAuth && window.washiAuth.getUsername() === 'Dhiraj';

          passportLogList.innerHTML = data.map(row => {
            const when = formatLogWhen(row.created_at);
            const rel = relativeWhen(row.created_at);
            const hasUrl = !!row.photo_url;
            const thumb = hasUrl
              ? `<a class="passport-log-thumb-link" href="${escapeAttr(row.photo_url)}" target="_blank" rel="noopener" title="Open full photo">
                   <img class="passport-log-thumb" src="${escapeAttr(row.photo_url)}" alt="Passport photo"
                        onerror="this.outerHTML='&lt;div class=\\'passport-log-thumb-missing\\'&gt;Image<br>missing&lt;/div&gt;'">
                 </a>`
              : `<div class="passport-log-thumb-missing">No image</div>`;
            const openLink = hasUrl
              ? `<a class="passport-log-open" href="${escapeAttr(row.photo_url)}" target="_blank" rel="noopener">↗ Open</a>`
              : '';
            const deleteBtn = canDelete
              ? `<button type="button" class="passport-log-delete" data-id="${row.id}" data-photo-url="${escapeAttr(row.photo_url || '')}" title="Delete this image">🗑 Delete</button>`
              : '';
            return `
              <div class="passport-log-item" data-row-id="${row.id}">
                ${thumb}
                <div class="passport-log-meta">
                  <span class="passport-log-when">${when}</span>
                  <span class="passport-log-when-rel">${rel}</span>
                </div>
                <div class="passport-log-actions">
                  ${openLink}
                  ${deleteBtn}
                </div>
              </div>
            `;
          }).join('');
```

- [ ] **Step 3: Manual verification — delete button visibility**

Start the local server and open the page:
```bash
cd /Users/dhiraj/Documents/TestVibe
python3 -m http.server 8765
```
In a browser, visit `http://localhost:8765/passport_photo_generator.html`.
1. Log in as **Dhiraj** at the auth overlay (passkey `7486`).
2. Click the "Tot. Images Processed" counter to open the log modal.
3. Expected: each row shows "↗ Open" and "🗑 Delete" side by side (or just "🗑 Delete" if no image). If the log is empty, generate one photo first via the main form so at least one row exists.
4. Open DevTools → Application/Storage → clear `localStorage` key `washi_auth` (or use a private window), reload, log in as **Neha** instead.
5. Reopen the log modal. Expected: rows show only "↗ Open" (or nothing, if no image) — **no** delete button.

- [ ] **Step 4: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add passport_photo_generator.html
git commit -m "Add gated delete button + styling to passport photo log rows"
```
(Skip if not a git repository, per Task 1 Step 4's note.)

---

### Task 3: Delete click handler

**Files:**
- Modify: `/Users/dhiraj/Documents/TestVibe/passport_photo_generator.html:1223` (insert new listener after the existing `passportLogClose` / modal-click listeners, before the `document.addEventListener('keydown', ...)` Escape handler)

**Interfaces:**
- Consumes: `supabaseClient` (module-level const, `passport_photo_generator.html:1022-1024`).
- Consumes: `COUNTER_TABLE` (`passport_photo_generator.html:1021`, value `'passport_photo_log'`).
- Consumes: `renderCounts()` (`passport_photo_generator.html:1054-1062`, re-fetches and re-renders the Total/Today counters from the DB).
- Consumes: `passportLogList` (DOM ref, `passport_photo_generator.html:1114`).
- Consumes: the `data-id` / `data-photo-url` attributes and `.passport-log-delete` / `.passport-log-item` classes produced by Task 2.

- [ ] **Step 1: Add the delegated delete handler**

In `passport_photo_generator.html`, immediately after this existing block (ending at line 1228):
```javascript
      if (passportLogModal) {
        passportLogModal.addEventListener('click', (e) => {
          if (e.target === passportLogModal) closePassportLogModal();
        });
      }
```
and before:
```javascript
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && passportLogModal && !passportLogModal.classList.contains('hidden')) {
          closePassportLogModal();
        }
      });
```
insert:

```javascript
      // Delete a processed image (Dhiraj-only; button is only rendered
      // for Dhiraj, but the check here is defense-in-depth).
      if (passportLogList) {
        passportLogList.addEventListener('click', async (e) => {
          const btn = e.target.closest('.passport-log-delete');
          if (!btn) return;
          if (!window.washiAuth || window.washiAuth.getUsername() !== 'Dhiraj') return;

          const id = btn.dataset.id;
          const photoUrl = btn.dataset.photoUrl;
          if (!confirm('Delete this processed image? This cannot be undone.')) return;

          btn.disabled = true;
          try {
            if (photoUrl) {
              const fileName = photoUrl.split('/passport-photos/').pop();
              if (fileName) {
                const { error: rmErr } = await supabaseClient.storage.from('passport-photos').remove([fileName]);
                if (rmErr) console.warn('Storage delete error:', rmErr);
              }
            }
            const { error: delErr } = await supabaseClient.from(COUNTER_TABLE).delete().eq('id', id);
            if (delErr) throw delErr;

            const item = btn.closest('.passport-log-item');
            if (item) item.remove();
            if (!passportLogList.querySelector('.passport-log-item')) {
              passportLogList.innerHTML = '<div class="passport-log-empty">No photos generated yet.</div>';
            }
            renderCounts();
          } catch (err) {
            console.warn('Delete failed:', err);
            btn.disabled = false;
            alert('Could not delete this image. Please try again.');
          }
        });
      }
```

- [ ] **Step 2: Apply the Task 1 SQL policy to the live database**

Open the Supabase Dashboard → SQL Editor for this project, paste the contents of `PASSPORT_PHOTO_LOG_DELETE_POLICY.sql`, and run it. Expected: "Success. No rows returned." This is required before Step 3 below will work — without it, the delete call fails with a row-level-security error.

- [ ] **Step 3: Manual verification — full delete flow**

With the local server still running (`http://localhost:8765/passport_photo_generator.html`):
1. Log in as **Dhiraj**. Generate one passport photo via the main form (upload an image, click "Generate sheet") so there's a fresh row with an image.
2. Open the log modal (click either counter). Note the current Total count.
3. Click "🗑 Delete" on the row you just created. Expected: a browser `confirm()` dialog appears with the text "Delete this processed image? This cannot be undone."
4. Click Cancel. Expected: nothing happens, row still present.
5. Click "🗑 Delete" again, then confirm. Expected: the row disappears from the modal immediately, and the Total counter (visible behind/after closing the modal) decreases by 1.
6. In the Supabase Dashboard → Storage → `passport-photos` bucket, confirm the corresponding file was removed.
7. In the Supabase Dashboard → Table Editor → `passport_photo_log`, confirm the row is gone.
8. Reopen the log modal — confirm the deleted row no longer appears (if it was the only row, expect "No photos generated yet.").

- [ ] **Step 4: Manual verification — delete a row with no image**

If a row without a `photo_url` exists (e.g. from a past failed upload), or you can produce one by testing with the network disabled during "Generate sheet" so `uploadPassportPhoto` fails but `incrementCounts` still runs — click its "🗑 Delete", confirm, and verify it deletes cleanly (no error) since the handler skips the storage call when `photoUrl` is empty.

If no such row is easy to produce, skip this step and note it as unverified rather than fabricating a result.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add passport_photo_generator.html
git commit -m "Wire up delete handler for passport photo log entries"
```
(Skip if not a git repository, per Task 1 Step 4's note.)

---

## Post-plan note

This project directory (`/Users/dhiraj/Documents/TestVibe`) is **not currently a git repository** (confirmed via `git rev-parse --is-inside-work-tree` returning "fatal: not a git repository"). All "Commit" steps above will have nothing to commit to — they're included per the plan template but should be skipped in execution, or converted to `git init` + commit only if the user explicitly asks for version control to be set up.
