# HydroCheck PH Free V3

HydroCheck PH Free V3 is a no-cost, offline-first hydroponics monitoring PWA for Android Chrome. It uses only local browser storage and export/import files.

## What is included

- Five starter hydroponics setups
- Weekly logs for water volume, pH, TDS, computed EC, water temperature, roots, pests, symptoms, notes, and plant photos
- Rule-based corrective recommendations
- Android sharing of the latest plant photo and readings for visual diagnosis in ChatGPT
- Sensor readings by manual entry or CSV import
- Reminders and browser notifications while the app is allowed to run
- JSON backup/restore and CSV exports
- PWA manifest and service worker for Android installation

## Run locally

```powershell
cd B:\PERSONAL\HYDROPONICS\hydrocheck-ph-free-v3
npm test
npm run serve
```

Open:

```text
http://localhost:5175/
```

## Install on Android

1. Make sure the phone and computer are on the same network.
2. Start the local server with `npm run serve`.
3. Open the local network URL from Chrome on Android if available, or copy the app folder to any HTTPS/free static host.
4. In Chrome, open the menu and choose **Add to Home screen** or **Install app**.

Android requires `localhost` or HTTPS for service workers. For true phone installation from another device, host this folder on a free static host or local HTTPS server.

## Free Version 3 design

This keeps the Version 3 feature direction without paid services:

- Sensors: use manual meter entry or CSV import from ESP32/Arduino logs.
- Automation: reminders and notifications are local browser features.
- Cloud sync: export a JSON backup, then share it to Google Drive, OneDrive, email, or Messenger.
- Plant photos and readings stay on the phone until the user chooses to share them.

No API key, paid AI, paid database, or paid hosting is required.

## Sensor CSV format

```csv
setup,dateTime,ph,tdsPpm,waterTempC,waterLevelLiters
Lettuce NFT A,2026-06-05T07:00,6.2,780,28,92
```

The app converts TDS to EC when the setup has a 500 or 700 meter scale.

## Files

- `index.html` - app shell
- `src/app.js` - UI and browser workflow
- `src/core.js` - EC conversion, recommendation rules, and exports
- `src/storage.js` - IndexedDB storage with localStorage fallback
- `service-worker.js` - offline cache
- `manifest.webmanifest` - install metadata
- `tests/core.test.mjs` - recommendation and costing tests
