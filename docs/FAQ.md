# cashu.me PWA FAQ

Alignment note (for this repo): This FAQ describes the Quasar-based cashu.me app. Our template uses Vue 3 + Vite + vite-plugin-pwa. See `docs/VUE.md` for the authoritative guide in this repo. Concept mapping:

> Template-specific note: This Vue + Vite template does not implement protocol handlers (`web+cashu`, `web+lightning`) or the QR scanner. Those features are documented below as they exist in cashu.me for reference only.

- Quasar PWA (Workbox) → `vite-plugin-pwa` in `vite.config.js`
- SW lifecycle hooks in `src-pwa/register-service-worker.js` → `useRegisterSW` in `src/App.vue`
- Manifest `src-pwa/manifest.json` → `manifest` block in `vite.config.js`
- PWA install components → install button + iOS banner in `src/App.vue`
- Offline strategy → App shell only; external APIs are network-only (`cache: 'no-store'`)

This FAQ explains the key pieces of the cashu.me PWA stack and why certain security-minded choices were made. It complements `docs/PWA.md` (cashu.me guide) and `docs/VUE.md` (this repo's Vue + Vite guide).

- See also: `quasar.config.js`, `src-pwa/manifest.json`, `src-pwa/register-service-worker.js`, `src/pages/WalletPage.vue`, `src/boot/base.js`.

## What is Quasar and why do we use it?

Quasar is a Vue 3 framework with a CLI and a rich component library. It unifies configuration for web (including PWA) and optional native builds.

- Where it’s configured: `quasar.config.js`.
- Why it fits a wallet:
  - Single configuration for SPA + PWA + optional native (Capacitor).
  - Mature UI components and dark mode support for consistent UX.
  - First-class PWA mode that wires the manifest and service worker correctly.

Related repo bits:
- `framework.plugins: ["LocalStorage", "Notify"]` in `quasar.config.js` expose common app features.
- PWA configuration lives under the `pwa` key in `quasar.config.js`.

## What is Capacitor?

Capacitor is a runtime that wraps your web app into native iOS/Android shells, letting you ship to app stores while sharing the same codebase.

- Where it shows up: `capacitor.config.ts`, `ios/`, `android/`.
- How it’s used here: optional. The PWA stands alone on the web; Capacitor can package it for native. We also use the Safe Area plugin for iOS in `src/boot/base.js` to respect notches/status bars.

## What is Workbox?

Workbox is Google’s library for building and owning your service worker (SW). Quasar integrates Workbox to generate and configure the SW for you.

- Mode in this repo: `workboxMode: "generateSW"` (see `quasar.config.js`).
- Options: `skipWaiting: true`, `clientsClaim: true` for immediate activation of updates.
- Alternative: `injectManifest` enables a custom SW (`src-pwa/custom-service-worker.js`) if you need advanced, hand-written caching strategies. It is off by default for safety.

## What does a Service Worker do here?

A service worker is a small script that runs separately from your page. It can intercept network requests and serve cached files to make your app fast and resilient.

- Registration: `src-pwa/register-service-worker.js`.
- Lifecycle hooks available: `ready`, `registered`, `cached`, `updatefound`, `updated`, `offline`, `error`.
- Update behavior: Because `skipWaiting` + `clientsClaim` are enabled, new SW versions take control immediately. Add a user-facing reload prompt in `updated()` so users can refresh safely.

## Why are wallet API responses not cached?

Security and privacy. Wallet APIs can include sensitive data (balances, tokens, invoices, mint interactions). Persisting these responses in SW caches risks:

- Leaking sensitive state if caches are inspected/shared.
- Serving stale or incorrect financial data while offline.
- Complex invalidation logic that can be error-prone.

Our approach:
- Use Workbox `generateSW` to precache only the app shell (static built assets). No runtime caching of wallet API requests is configured.
- Keep sensitive interactions network-only and handle offline mode explicitly in the UI.

Where to look:
- PWA config: `quasar.config.js` (no runtime caching rules are added).
- Connectivity state: `src/boot/base.js` sets `g.offline` based on `online`/`offline` events so the UI can disable network-only actions.

## How do protocol handlers work here?

The manifest declares handlers so custom links can open the PWA:

- `web+cashu:<token>` → `/?token=%s`
- `web+lightning:<invoice>` → `/?lightning=%s`

Where this is defined:
- `src-pwa/manifest.json` under `protocol_handlers`.

How links are handled:
- `src/pages/WalletPage.vue` reads query parameters on startup and opens the appropriate dialogs. It includes checks to avoid re-processing already-seen tokens.

## How is install UX handled?

- Android/Desktop (Chrome): The app listens for the `beforeinstallprompt` event, stashes it, and shows an install button only when appropriate display mode is "browser". See `registerPWAEventHook()` and `getPwaDisplayMode()` in `src/pages/WalletPage.vue`.
- iOS Safari: No `beforeinstallprompt`. A custom banner in `src/components/iOSPWAPrompt.vue` nudges users to "Add to Home Screen".
- Android Chrome banner: `src/components/AndroidPWAPrompt.vue` shows a gentle prompt when not in standalone mode.

## How do updates roll out?

- Immediate activation via `skipWaiting` + `clientsClaim`.
- Recommended: In `src-pwa/register-service-worker.js`, use the `updated()` hook to show a notification/toast with a Reload action.

## How do I test offline?

- Build PWA: `npm run build:pwa` and serve `dist/pwa` over HTTPS.
- In Chrome DevTools → Application panel → Service Workers: toggle "Offline" and verify the app shell loads while network-only features are disabled.
- Use Lighthouse (PWA category) to verify installability and offline basics.

## Where are icons and manifest?

- Manifest: `src-pwa/manifest.json` (app name, colors, icons, screenshots, protocol handlers).
- Icons: `public/icons/` (maskable `icon-*.png` for install, plus small favicons referenced by `index.html`).

## Wallet APIs (overview)

This is how the wallet talks to mints and Lightning, with references to `src/stores/wallet.ts`:

- __Request a mint invoice__ — `requestMint(amount, mintWallet)` builds a `MintQuotePayload` and calls `mintWallet.mint.createMintQuote()`. It stores the `MintQuoteResponse` and the invoice in `invoiceHistory` (`cashu.invoiceHistory`).
- __Mint tokens after payment__ — `mint(invoice)` first `checkMintQuote(invoice.quote)`. If `state === PAID`, it calls `mintWallet.mintProofs(amount, quote, { keysetId, counter, proofsWeHave })`, adds proofs to the proofs store, and marks the invoice `paid`.
- __Get a melt quote (to pay LN)__ — `meltQuote(wallet, request, mpp_amount?)` calls `wallet.createMeltQuote()` or `wallet.createMultiPathMeltQuote()` and stores the response in `payInvoiceData.meltQuote`.
- __Pay the invoice (melt)__ — `melt(proofs, quote, mintWallet)` selects proofs via `send(...)`, reserves them, then calls `mintWallet.meltProofs(quote, sendProofs, { keysetId, counter })`. NUT-08 change is added back to the proofs store. History is updated with a negative amount when paid.
- __Redeem incoming tokens__ — `redeem()` decodes the token from UI state, calls `mintWallet.receive(...)` (optionally P2PK) to receive proofs, and records the paid token in history.
- __Check proofs__ — `checkProofsSpendable(proofs, wallet)` calls `wallet.checkProofsStates()` and removes `SPENT` proofs from the proofs store; optionally records a negative history entry.

Notes and safety:

- __Network-only__: These calls are not cached by the service worker; they always hit the mint/network to avoid stale/sensitive data in caches.
- __Keysets/counters__: `getKeyset()` selects an active keyset per unit; counters are persisted in `cashu.keysetCounters` so NUT-08 outputs are unique. See `increaseKeysetCounter()` usages in `mint()`/`melt()`.
- __Local persistence vs SW caching__: Wallet state such as `cashu.mnemonic`, `cashu.invoiceHistory`, `cashu.keysetCounters`, `cashu.oldMnemonicCounters` is kept in LocalStorage via VueUse; the SW only precaches static assets.

### Network-only, no SW caching

- Config: `quasar.config.js` uses `workboxMode: "generateSW"` with `skipWaiting` + `clientsClaim`. No runtime caching routes are added.
- SW registration: `src-pwa/register-service-worker.js` wires lifecycle hooks; consider adding a user-facing prompt in `updated()` to refresh.

## SPA (Single Page Application) in this repo (ELI5)

- __What it means__: One HTML page (`index.html`) loads a Vue app. Navigation is handled on the client; content swaps without full page reloads.
- __Routing__: `src/router/routes.js` defines routes; `src/router/index.js` creates the router. In `quasar.config.js`, `build.vueRouterMode: "history"` enables clean URLs.
- __Pages and layout__: Views live under `src/pages/` and the root shell under `src/App.vue` (layouts under `src/layouts/`).
- __Deep links__: Protocol handlers map to query params (see `src-pwa/manifest.json`); `src/pages/WalletPage.vue` reads them on startup.

Practical tips:

- When hosting with history mode, ensure your server falls back to `index.html` for unknown routes in production builds. If you adopt `injectManifest`, you can configure a navigation fallback in the custom service worker; otherwise rely on server fallback.

## Commands

For this Vue + Vite template (this repo):

- Dev: `npm run dev` (http://localhost:5175)
- Build: `npm run build`
- Preview: `npm run preview` (http://localhost:5174)

For the cashu.me project (Quasar CLI), see its repository for specific commands.

---

If you later enable `injectManifest` or add runtime caching, review all caching rules with a security mindset and document changes alongside this FAQ.
