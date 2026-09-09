# Google Apps Script Web App: High-Performance Batch Operations & CORS Architecture

## 1. Why standard Fetch fails with Google Apps Script
When making an HTTP POST request to a Google Apps Script Web App:
- If `Content-Type: application/json` is sent, the browser treats it as a non-simple request and sends an HTTP `OPTIONS` preflight request.
- Google Apps Script infrastructure **does not handle `OPTIONS` requests** for Web Apps, returning an HTTP 405 or dropping the request.
- Furthermore, GAS Web Apps execute a `302 Moved Temporarily` redirect to an ephemeral URL on `script.googleusercontent.com`.

### The Solution: "Simple Request" via `text/plain`
Sending `Content-Type: text/plain;charset=utf-8` satisfies the Fetch standard for a **Simple Request**:
- No `OPTIONS` preflight is sent.
- The request passes straight to `doPost(e)` on GAS.
- GAS receives raw string payload via `e.postData.contents`, which can be cleanly deserialized using `JSON.parse(e.postData.contents)`.
- GAS responds with `ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)`.
- Client browser receives standard CORS headers (`Access-Control-Allow-Origin: *`) and allows reading `await res.json()`.

---

## 2. Server-Side Batch Performance in Google Sheets (`Code.gs`)

### Bad: Row-by-Row Appending (`appendRow`)
Calling `sheet.appendRow()` or individual `getRange().setValue()` inside a loop makes a separate RPC call to Google's backend for each row. For 1,500 rows, this takes 10–15 minutes and frequently hits the 6-minute execution quota or HTTP gateway timeout.

### Good: Bulk In-Memory Processing & `setValues()`
1. Read all existing rows into memory in one call: `sheet.getDataRange().getValues()`.
2. Build an in-memory `Map` or index of keys (e.g. `item_code` -> row index).
3. Process incoming items against the map:
   - If key exists: update the corresponding row array in memory.
   - If key is new: push a new row array to an `appendList`.
4. Write updates using `getRange(startRow, 1, numRows, numCols).setValues(updatedMatrix)`.
5. Write new rows using `getRange(lastRow + 1, 1, newRows.length, numCols).setValues(newRowsMatrix)`.

### Benchmark Results
- 200 items in single batch: **~4 to 7 seconds**
- 1,567 items in 8 chunks of 200: **~30 to 45 seconds total**
