# Vite + Vue PWA Template (cashu.me-style)

This guide documents how we migrated the vanilla PWA template to Vue 3 + Vite while keeping cashu.me-like UX:
- Install experience (Android prompt, iOS A2HS hint)
- Offline-aware UI and auto-update service worker
- Clean component structure for the app shell and features

## Tech Stack
- Vue 3 + `<script setup>`
- Vue Router (SPA)
- Vite
- vite-plugin-pwa (GenerateSW, auto updates)

## Project Layout
- `index.html` – minimal entry with `#app` and Vite module script
- `src/main.js` – bootstraps Vue app and imports `styles.css`
- `src/App.vue` – app shell, banners, install UX, network detection, update banner
- `src/router.js` – routes
- `src/views/HomeView.vue` – core features: height, price, converter, polling
- `styles.css` – theme and layout (imported by Vite)
- `vite.config.js` – PWA plugin, manifest, dev server
- `public/` – static assets (icons, robots, etc)

Note: Legacy (not used) at repo root: `/sw.js`, `/manifest.json`, and `/main.js` were part of an earlier prototype. With `vite-plugin-pwa` and Vue entry `src/main.js`, they are unused/unreferenced and can be removed later.

## PWA Setup
`vite.config.js`:
- `VitePWA({ registerType: 'autoUpdate', workbox: { skipWaiting: true, clientsClaim: true }, manifest: { ... } })`
- Auto-update SW: The app shows an update banner using `useRegisterSW` and applies the new SW on reload.
- Icons: Place maskable icons in `public/icons/` and reference them in manifest.
  - SVG: `public/icons/icon-192.svg`, `public/icons/icon-512.svg`
  - PNG: `public/icons/icon-192.png`, `public/icons/icon-512.png`

`src/App.vue`:
- Uses `useRegisterSW` from `virtual:pwa-register/vue` to show the update available banner and call `updateServiceWorker()`.
- Handles `beforeinstallprompt` to enable an Install button on Android.
- Detects iOS Safari and shows an A2HS hint (Share → Add to Home Screen) with dismiss persistence in `localStorage`.
- Tracks `navigator.onLine` to surface offline status.

## Feature Port (HomeView.vue)
- Block height: tries multiple APIs (mempool.space, blockstream.info, blockcypher). Network-only via `fetch(..., { cache: 'no-store' })`.
- Price (USD): tries CoinGecko, Binance. Network-only fetch.
- Converter: USD ↔ sats; recalculates after price refresh; no floating drift (sats reads use `Math.floor`).
- Polling: optional auto-refresh with interval (5–3600s), persisted in `localStorage`.

Security note: All external API calls are network-only and not cached by the SW.

## Run & Build
```
# from repo root
npm install
npm run dev   # http://localhost:5175
npm run build
npm run preview
```

## What to Verify
- Install banner (Android). On iOS Safari, A2HS hint shows only in browser display-mode.
- Offline UI banner appears when disconnected.
- SW update banner appears after a new build; reload to apply.
- Height/price refresh works; auto-refresh if toggled; converter updates.

## Next Improvements
- Expand icon set (additional sizes) and add splash screens if desired.
- Add global theme variables to a dedicated CSS module or PostCSS.
- Add more views/components if needed and introduce state management (Pinia) if the app grows.
