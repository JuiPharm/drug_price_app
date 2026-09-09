---
name: webapp-excel-gas-integration
description: >-
  Best practices, architectural patterns, and troubleshooting runbook for integrating
  client-side Web Apps (HTML/JS) with Excel/SheetJS imports, Google Apps Script (GAS) Web App
  backends, SweetAlert2 UI/UX, and large-dataset chunking. Use when developing or debugging
  Web Apps connected to Google Sheets, handling Excel (.xls/.xlsx) file uploads, designing
  modal/progress UI, or resolving CORS and execution limit issues.
---

# Web App + Excel + Google Apps Script (GAS) Integration Skill

This skill documents proven patterns, architectural solutions, and lessons learned for building robust client-side Web Applications backed by Google Sheets (via Google Apps Script Web Apps) and processing Excel reports (SheetJS).

---

## 🧭 Quick Decision Matrix & Golden Rules

| Area | ❌ Common Anti-Pattern / Pitfall | ✅ Golden Rule / Proven Fix |
|---|---|---|
| **Modal Hierarchy** | Opening SweetAlert2 while `<dialog>` is open (SweetAlert gets hidden behind `<dialog>`) | **Browser Top Layer Rule:** Always call `dialog.close()` *before* opening `Swal.fire()`. Reopen `<dialog>` only if user cancels. |
| **GAS Backend CORS** | Using `mode: 'no-cors'` with `application/json` (opaque response, cannot read status/error/JSON) | **Simple Request Rule:** Send `method: 'POST'` with `Content-Type: text/plain;charset=utf-8`. GAS parses `JSON.parse(e.postData.contents)` and returns standard CORS headers (`Access-Control-Allow-Origin: *`). |
| **Data Batching** | Uploading 1,000+ items row-by-row (~15 mins, rate limit) or all at once (GAS 6-min timeout) | **Chunking Rule:** Use `CHUNK_SIZE = 200` items per batch request. Takes ~4-7s per batch. 1,500 items import in ~30 seconds. |
| **Excel Parsing** | Matching raw column headers directly (e.g. `row['ชื่อ']`) | **Sanitization Rule:** Always strip `\r` and `\n` from headers and maintain alias dictionaries for field mapping. |
| **UI Responsiveness** | Synchronous heavy loops without DOM yield; unhandled missing helpers (`delay is not defined`) | **Yield Rule:** Call `await delay(150-200)` between chunks to let CSS animations and DOM updates render smoothly. Always verify `delay()` definition. |
| **Pagination** | Loading 50-100+ rich DOM cards at once | **Card Density Rule:** Default to 20 items per page (`PAGE_SIZE = 20`). Clearly display remaining count on "Load More" button. |

---

## 1. Browser Dialog (`<dialog>`) vs. SweetAlert2 (The Top Layer Trap)

### Problem
HTML5 `<dialog>` opened via `.showModal()` lives in the browser's **Top Layer**. Elements in the top layer render above **all** elements in the normal document, regardless of `z-index` (even `z-index: 9999999`). When SweetAlert2 injects its DOM into `document.body`, it is rendered behind the dialog, appearing invisible or rendering the screen unresponsive.

### Implementation Pattern
```javascript
// 1. User clicks "Confirm Import" inside the Excel <dialog>
function onConfirmClicked() {
  // MUST close native dialog first
  if (el.excelDialog && el.excelDialog.open) {
    el.excelDialog.close();
  }

  // 2. Open front-and-center SweetAlert2 confirmation
  Swal.fire({
    title: 'ยืนยันการนำเข้าข้อมูล?',
    text: `พร้อมนำเข้าทั้งหมด ${rows.length} รายการ`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '🚀 เริ่มนำเข้าข้อมูล',
    cancelButtonText: 'กลับไปแก้ไข'
  }).then((result) => {
    if (result.isConfirmed) {
      startLiveImport(rows);
    } else {
      // Reopen dialog if user cancelled
      el.excelDialog.showModal();
    }
  });
}
```

---

## 2. Google Apps Script CORS & High-Speed Batch Import

### The CORS Secret of Google Apps Script
Google Apps Script does NOT support preflight `OPTIONS` requests triggered by `Content-Type: application/json`.
By sending `Content-Type: text/plain;charset=utf-8`, the browser treats it as a **CORS Simple Request** (no `OPTIONS` preflight).

```javascript
// Client-side fetch helper
async function postGAS(payload) {
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Server error');
  return data;
}
```

### Server-Side (`Code.gs`) Batch Import Endpoint
Instead of row-by-row `appendRow()`, process items in memory and write in bulk:
```javascript
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'batch_import') {
      return handleBatchImport(body.items || [], body.mode || 'upsert');
    }
    // other actions: add, save, get...
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function handleBatchImport(items, mode) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  // Build lookup index, process updates/adds, write with setValues()
  // ...
  return jsonResponse({ ok: true, count: items.length });
}
```

### Chunking Engine
```javascript
const CHUNK_SIZE = 200;
const chunks = [];
for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
  chunks.push(rows.slice(i, i + CHUNK_SIZE));
}

for (let c = 0; c < chunks.length; c++) {
  updateProgress(c + 1, chunks.length);
  await postGAS({ action: 'batch_import', items: chunks[c] });
  await delay(150); // Yield to let UI repaint
}
```

---

## 3. Excel & Legacy Hospital Report Sanitization (SheetJS)

Legacy hospital software (Crystal Reports, CrystalViewer) frequently exports `.xls` files with hidden whitespace:
- Column headers with trailing newlines: `"กลุ่มใบเสร็จ ipd\n"`
- Inconsistent casing or minor typos across systems: `GenercName` (no 'i') vs `GenericName`

### Sanitization Pipeline
```javascript
function sanitizeHeader(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/[\r\n\t]+/g, ' ') // Strip newlines/tabs
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();
}

function normalizeKey(str) {
  return sanitizeHeader(str).toLowerCase().replace(/[\s_\-.]+/g, '');
}
```

Always use an alias mapping array for flexible auto-mapping:
```javascript
const FIELD_DEFINITIONS = [
  {
    key: 'GenercName',
    aliases: ['genercname', 'genericname', 'generic', 'ชื่อสามัญ', 'generic name']
  },
  {
    key: 'item_code',
    aliases: ['item_code', 'itemcode', 'code', 'รหัสยา', 'barcode', 'รหัสสินค้า']
  }
];
```

---

## 4. Required Utility Helpers

Always ensure the following foundational helpers exist in your script scope:

```javascript
// Delay helper for UI repainting & throttle
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// HTML escaping to prevent XSS in dynamic card grids
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

---

## 5. Troubleshooting Runbook

| Symptom | Cause | Remedy |
|---|---|---|
| `ReferenceError: delay is not defined` | `delay()` called in async loop but not declared | Add `const delay = (ms) => new Promise(r => setTimeout(r, ms));` |
| SweetAlert appears dimmed or behind dialog | `<dialog>` is open in Top Layer | Call `dialog.close()` before `Swal.fire()` |
| `SyntaxError: Unexpected end of JSON input` | Using `mode: 'no-cors'` on fetch | Remove `no-cors` and use `Content-Type: text/plain;charset=utf-8` |
| Upload times out after 1-2 minutes | Uploading too many items in a single request | Break data into `CHUNK_SIZE = 200` and send sequentially |
| Columns not matching after Excel upload | Headers contain `\n` or `\r` | Run `replace(/[\r\n]+/g, ' ').trim()` on parsed headers |
| `fatal: .git/index: index file smaller than expected` | `.git/index` corrupted (0 bytes) | Run `Remove-Item .git/index; git reset` |
