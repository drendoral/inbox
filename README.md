# Inbox

A tiny installable phone app (PWA) that sends English phrases straight into the Google Doc
**daily in doc 001**, one line per entry:

```
<text> [<tag>] [<context>] [YYYY-MM-DD HH:MM] ⟨<id>⟩
```

**Setup:** see [SETUP.md](SETUP.md) (click by click).

## How it works

- **App** (`index.html`, `app.js`, `core.js`, `tagger.js`, `sw.js`): static files on GitHub Pages.
  Entries go into on-device storage (IndexedDB) first, then to the script. Offline entries are queued
  and sent automatically. Works offline and can be installed from Chrome.
- **Backend** (`apps-script/Code.gs`): a Google Apps Script web app running as you. It only accepts
  requests that carry your secret token. Actions: `add`, `delete` (by id), `count`, `ping`.
- **Auto-cleanup:** every hour the script reads `daily in doc/Anki/inbox-used-*.txt`. Each line is an
  entry id (or, for old entries, the exact line text). It deletes only those paragraphs, trashes the
  file, and logs what it deleted in the **Phrase Inbox log** sheet.

## Features

Big text box focused on open · **Post** and Ctrl/Cmd+Enter · **hold-to-talk** voice input (en-US) ·
**automatic tags** (Word for a thing / Work / Couldn't say) · recent entries with search, tap to open,
delete (also removes the line from the doc), "⋮" to show more · ☰ menu with the "N waiting" counter
and connection settings · share target · light and dark mode.

## Files

| Path | What |
|---|---|
| `apps-script/Code.gs` | Paste into the doc's Apps Script editor |
| `apps-script/appsscript.json` | Reference manifest (optional) |
| `icons/` | App icons (normal and maskable) and header logo, made by `tools/make-icons.ps1` |
| `tests/test.html` | Automated tests: runs `Code.gs` against fake Docs/Drive, plus tags and the sync queue |
| `tools/serve.ps1` | Local test server: `powershell -ExecutionPolicy Bypass -File tools\serve.ps1`, then open `http://localhost:8765/tests/test.html` |
