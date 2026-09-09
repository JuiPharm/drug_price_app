# HTML5 Native <dialog> Top Layer vs. SweetAlert2 Architecture Guide

## 1. The Rendering Hierarchy Trap
Browsers handle `<dialog>` with `.showModal()` via an internal **Top Layer** rendering context.

```
+-------------------------------------------------------------+
| Browser Top Layer (Native modal dialogs, full screen APIs)  |
|   -> <dialog open>                                          |
+-------------------------------------------------------------+
| Stacking Context (document.body)                            |
|   -> Normal DOM elements                                    |
|   -> Elements with z-index: 1000, 99999                     |
|   -> SweetAlert2 containers (.swal2-container)              |
+-------------------------------------------------------------+
```

### The Invariable Rule
**No CSS rule, `z-index`, or stacking trick in `document.body` can elevate an element above the Browser Top Layer.**
Therefore, attempting to fix SweetAlert visibility issues with CSS like:
```css
/* THIS WILL NOT WORK */
.swal2-container {
  z-index: 999999999 !important;
}
```
will always fail if a `<dialog>` was opened with `.showModal()`.

## 2. The Clean Flow Pattern
Always follow the **Temporal Modal Handshake**:
1. When user triggers an action that needs SweetAlert:
   - Call `dialog.close()` to drop out of the Top Layer.
2. Open `Swal.fire(...)` in `document.body`.
3. If user cancels:
   - Call `dialog.showModal()` to restore the previous state without data loss.
4. If user confirms:
   - Transition SweetAlert into the Progress state (`Swal.getHtmlContainer()`).
5. When finished:
   - Show final confirmation SweetAlert, then resolve and cleanup.
