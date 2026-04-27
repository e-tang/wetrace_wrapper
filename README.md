# WetraceTool — WeChat Encryption Key Extractor

A lightweight Electron app that extracts the WeChat SQLCipher database encryption key from a running WeChat session. No sync, no tray — just run it, copy your key, close it.

## What it does

1. **Detects WeChat** — waits for WeChat to be running on your PC
2. **Guides logout** — asks you to reach the WeChat login screen
3. **Extracts the key** — restarts WeChat with an injected hook via `wetrace.exe`, captures the key the moment you log in
4. **Copy to clipboard** — displays the key (and database path if detected) with one-click copy buttons

The key can then be used with `decrypt_sync.exe` or any other SQLCipher-aware tool to read your WeChat message databases.

---

## Requirements

- Windows 10/11 x64
- WeChat (国际版) or Weixin (微信) installed
- `vendor/wetrace.exe` — the hook backend (see [Setup](#setup))

---

## Setup

### Option A — Copy from wereadmsg project (fastest)

```bat
cp ..\wereadmsg\vendor\wetrace.exe vendor\
```

### Option B — Build wetrace.exe from source

```bash
./build.sh --wetrace
```

Requires Go installed and the `wetrace` source at `C:\cygwin64\home\dev\code\wetrace`.

---

## Running (development)

```bash
npm install
npm start
```

---

## Building the installer

```bash
./build.sh
```

Produces `dist/WetraceTool-Setup-<version>.exe`.

To rebuild `wetrace.exe` and the installer in one step:

```bash
./build.sh --wetrace
```

---

## Usage

1. Launch **WetraceTool**
2. Open WeChat if it isn't already running — the app will detect it automatically
3. Log out of WeChat (or confirm you're already at the login screen)
4. Click **Start — I'm ready to log in**
5. WeChat will restart — **log in within 60 seconds**
6. The key is captured automatically and shown on screen
7. Click **Copy Key** to copy it to the clipboard
8. Close the app when done

> **Note:** The app requires administrator privileges so `wetrace.exe` can attach to the WeChat process.

---

## Project structure

```
wetrace_wrapper/
  main.js          — Electron main process (window + wetrace + IPC)
  preload.js       — contextBridge API exposed to renderer
  renderer/
    index.html     — app shell
    app.js         — wizard UI (4 steps)
    styles.css     — dark theme
  assets/
    icon.ico
  vendor/
    wetrace.exe    — WeChat hook backend (not committed, copy manually)
  build.sh         — build script
  package.json
```

---

## How key extraction works

`wetrace.exe` is a small Go program that injects a DLL hook into the WeChat process.
When WeChat initialises its SQLCipher databases at login, the hook intercepts the key
derivation call and exposes it via a local HTTP API on `127.0.0.1:18888`.

WetraceTool calls `GET /api/v1/system/wxkey/db` on that API with a 70-second timeout —
long enough for you to complete the WeChat login.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "wetrace.exe not found" | Copy `wetrace.exe` into `vendor/` |
| Timer runs out, no key | Make sure you logged in **after** clicking Start |
| WeChat not detected | Check tasklist for `Weixin.exe` or `WeChat.exe` |
| App closes immediately | Run as Administrator |
