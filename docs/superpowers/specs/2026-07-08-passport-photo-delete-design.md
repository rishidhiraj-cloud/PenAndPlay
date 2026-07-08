# Passport Photo Log — Delete for Dhiraj

**Date:** 2026-07-08
**Status:** Approved

## Problem

The Passport Photo Generator's log modal (`passport_photo_generator.html`) lists every processed image with an "Open" link to view it full-size, but there's no way to remove an entry. Dhiraj should be able to delete processed images (log row + stored file) directly from the log.

## Scope

- Only the logged-in user "Dhiraj" (per `window.washiAuth.getUsername()`) sees the delete button.
- Delete button appears beside the existing "Open" link in each `.passport-log-item`.
- Deleting removes both the Supabase Storage file (`passport-photos` bucket) and the `passport_photo_log` DB row.
- Confirmation prompt (`confirm()`) required before deleting, matching the existing delete pattern in `history.js`.

## Database changes

`passport_photo_log` currently has RLS policies for INSERT and SELECT only (`PASSPORT_PHOTO_TABLE.sql`) — no DELETE policy, so a client-side delete would be silently blocked by RLS.

New file `PASSPORT_PHOTO_LOG_DELETE_POLICY.sql`, following the existing pattern (e.g. `SUPABASE_FIX.sql`'s `daily_entries` delete policy):

```sql
DROP POLICY IF EXISTS "Allow public delete" ON passport_photo_log;
CREATE POLICY "Allow public delete"
    ON passport_photo_log
    FOR DELETE
    TO public
    USING (true);
```

The storage bucket (`passport-photos`) already has a DELETE policy from `PASSPORT_PHOTO_LOG_SETUP.sql` — no bucket changes needed.

This file must be run manually by the user in the Supabase SQL Editor (this codebase has no migration runner — all schema changes are applied this way, per the existing `.sql` files in the repo root).

## UI changes (`passport_photo_generator.html`)

### Row template

In `openPassportLogModal`'s row-rendering code (~line 1175-1198), each `.passport-log-item`:
- Gains `data-id="${row.id}"` and `data-photo-url="${escapeAttr(row.photo_url || '')}"` attributes.
- Gains a delete button next to the Open link, rendered only when `window.washiAuth.getUsername() === 'Dhiraj'`:
  ```html
  <button type="button" class="passport-log-delete" data-id="${row.id}" data-photo-url="${escapeAttr(row.photo_url || '')}" title="Delete">🗑</button>
  ```
- Rows with no image (`hasUrl` false) still get the delete button — it deletes the log row only (nothing to remove from storage).

### Styling

`.passport-log-delete` styled similarly to `.passport-log-open` (same font-size/weight/uppercase treatment) but in a red/danger tint, with a light hover background, dark-mode variant included — consistent with existing danger-state colors already used in `.pp-status.error`.

### Delete handler

Single delegated click listener on `passportLogList` (rows are replaced via `innerHTML` on every render, so per-row listeners would leak/not attach):

```js
passportLogList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.passport-log-delete');
  if (!btn) return;
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

    btn.closest('.passport-log-item').remove();
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
```

Notes:
- Storage removal failure is logged but non-blocking (matches the existing best-effort pattern used elsewhere on this page, e.g. `uploadPassportPhoto`) — the row is still deleted from the log as long as the DB delete succeeds, so a stray orphaned file in storage doesn't leave the log stuck.
- DB delete failure aborts the whole operation (row stays, button re-enabled, alert shown) since that's the source of truth for the counters.
- After deletion, `renderCounts()` re-fetches from the DB so Total/Today counters reflect the actual row count (no manual decrement needed).

## Out of scope

- Bulk delete / multi-select.
- Undo/restore after delete.
- Role-based delete for any user other than Dhiraj.
- Any change to Rohit's restricted access (unaffected — he already can't see delete since the check is name-based).

## Testing

- Manual verification via browser: log in as Dhiraj, open the log modal, confirm delete button is visible and works (row + storage file removed, counters update).
- Log in as a different user (e.g. Neha), confirm delete button is absent.
- Delete a row with no `photo_url` ("No image" placeholder) — confirm it deletes cleanly with no storage call.
