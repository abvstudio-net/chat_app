# A Guide to cashu.me PWA setup

Alignment note (for this repo): This document describes the Quasar-based cashu.me app. Our template uses Vue 3 + Vite + vite-plugin-pwa. For the authoritative template guide, see `docs/VUE.md`. Concept mapping:

- Note for this template: Protocol handlers (`web+cashu`, `web+lightning`) and the QR scanner are not implemented in this Vue + Vite template. Mentions of those features below reflect how cashu.me works and are kept for background only.

- Quasar Workbox PWA mode → `vite-plugin-pwa` in `vite.config.js`
- `generateSW` defaults → `registerType: 'autoUpdate'`, `workbox: { skipWaiting, clientsClaim }`
- `src-pwa/register-service-worker.js` → `useRegisterSW` usage in `src/App.vue`
- `src-pwa/manifest.json` → `manifest` block in `vite.config.js`
- Install prompts components → Install button + iOS banner in `src/App.vue`
- Offline strategy → App shell precached only; external APIs fetched with `cache: 'no-store'`

The purpose of this guide is to explain to a new software engineer how to create a PWA in the same fashion as cashu.me.  The sections below will explain PWA best practices and use examples from this repo to explain how a project can be created in the same fasion.

Cashu.me is a well-known and fully-functional PWA whose example should be emulated by other software.

## What you’ll build

This guide explains how the `cashu.me` web wallet implements a robust Progressive Web App using Quasar (Vue 3), Workbox, and Capacitor. By the end, you can replicate the same PWA setup (installable, offline-capable shell, protocol handlers) and understand the trade-offs taken for a security-sensitive wallet.

Key repo references used throughout:

- `quasar.config.js` — PWA mode and Workbox options.
- `src-pwa/register-service-worker.js` — SW registration lifecycle hooks.
- `src-pwa/custom-service-worker.js` — template for injectManifest.
- `src-pwa/manifest.json` — app identity, icons, screenshots, protocol handlers.
- `src/pages/WalletPage.vue` — install UX, display-mode detection, protocol handler handling.
- `src/components/iOSPWAPrompt.vue` and `src/components/AndroidPWAPrompt.vue` — platform-specific install banners.
- `src/boot/base.js` — global online/offline state and UI helpers.
- `index.html` — favicons.


## Stack overview

- __Framework__: Vue 3 + Quasar CLI (Vite) SPA
- __State__: Pinia
- __Native builds__: Capacitor (optional)
- __PWA__: Workbox via Quasar PWA mode
- __Service worker__: `generateSW` by default; `injectManifest` optional
- __Custom schemes__: Web App Manifest protocol handlers for `web+cashu` and `web+lightning`

### ELI5: The stack in plain English

- __Vue 3__ is the UI framework (components, reactivity, routing).
- __Quasar__ is a batteries-included toolkit on top of Vue. It ships UI components, CLI, and PWA/Capacitor/Electron build modes so you don’t glue tools yourself.
- __Vite__ (used by Quasar CLI) is the fast dev server/bundler.
- __Pinia__ is the state manager (shared app state across components).
- __Workbox__ builds/controls the service worker and caching.
- __Capacitor__ wraps the PWA into a native app if you want app-store builds.

### Why Quasar for a wallet

- __Single config__ for web PWA and optional native builds.
- __Polished components__ for consistent UX and theming.
- __Integrated PWA mode__ that wires Workbox, manifest, and SW paths correctly.

### Alternatives

- Pure Vue + Vite + Workbox; Nuxt; React/Next; SvelteKit. The concepts in this guide still apply: manifest + SW + install UX.

## PWA configuration (Quasar)

Located in `quasar.config.js`, the PWA section configures Workbox:

```js
// excerpt from quasar.config.js
pwa: {
  workboxMode: "generateSW", // or 'injectManifest'
  injectPwaMetaTags: true,
  swFilename: "sw.js",
  manifestFilename: "manifest.json",
  useCredentialsForManifestTag: false,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
  // useFilenameHashes: true,
  // extendGenerateSWOptions (cfg) {}
  // extendInjectManifestOptions (cfg) {},
  // extendManifestJson (json) {}
  // extendPWACustomSWConf (esbuildConf) {}
},
```

Notes:

- __generateSW__ precaches the build assets (app shell). No runtime caching of wallet APIs is added (deliberate security choice).
- __skipWaiting + clientsClaim__ make updates activate immediately; pair with a UI prompt to refresh (see Update flow).
- To switch to `injectManifest`, set `workboxMode: 'injectManifest'` and use `src-pwa/custom-service-worker.js`.


### Deep dive: What these options do

- __workboxMode__
  - `generateSW` lets Workbox auto-generate a SW with sensible defaults and a precache list of built files. Minimal, safer, great for app shells.
  - `injectManifest` gives you a custom SW file where you define exact caching strategies. Powerful but easy to misuse; require careful security review for wallets.
- __skipWaiting__ tells a newly installed SW to activate immediately instead of waiting for all tabs to close.
- __clientsClaim__ makes the new SW take control of open pages right away.
- __swFilename/manifestFilename__ control output names; Quasar serves them from the PWA dist root.
- __injectPwaMetaTags__ adds useful meta tags (theme/color, etc.) automatically in HTML.
- __useCredentialsForManifestTag__ usually false; set true only if your manifest URL must send cookies (rare for public apps).

ELI5: `generateSW` is like auto-pilot. `injectManifest` is manual mode. Wallets usually start with auto-pilot for safety.
## Service worker registration

Quasar registers the SW via `src-pwa/register-service-worker.js` using the `register-service-worker` lib:

```js
// src-pwa/register-service-worker.js
import { register } from "register-service-worker";

// The ready(), registered(), cached(), updatefound() and updated()
// events passes a ServiceWorkerRegistration instance in their arguments.
// ServiceWorkerRegistration: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration

register(process.env.SERVICE_WORKER_FILE, {
  // The registrationOptions object will be passed as the second argument
  // to ServiceWorkerContainer.register()
  // https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#Parameter

  // registrationOptions: { scope: './' },

  ready(/* registration */) {
    // console.log('Service worker is active.')
  },

  registered(/* registration */) {
    // console.log('Service worker has been registered.')
  },

  cached(/* registration */) {
    // console.log('Content has been cached for offline use.')
  },

  updatefound(/* registration */) {
    // console.log('New content is downloading.')
  },

  updated(/* registration */) {
    // console.log('New content is available; please refresh.')
  },

  offline() {
    // console.log('No internet connection found. App is running in offline mode.')
  },

  error(/* err */) {
    // console.error('Error during service worker registration:', err)
  },
});
```

Hook to `updated()` to notify users and refresh (see Update flow).


### ELI5: What is a service worker?

- A special JS file that runs separate from your web page.
- It can listen to network requests and serve cached files to make your app fast and resilient.
- It cannot access the DOM directly and has its own lifecycle.

### Lifecycle hooks explained

- __ready__ — SW is controlling the page; good time to log or toggle UI.
- __registered__ — SW file was registered with the browser.
- __cached__ — app shell files were added to the cache (offline-ready UI).
- __updatefound__ — a new version of the SW is being downloaded.
- __updated__ — new content is available. Show a prompt to reload.
- __offline__ — browser is offline; disable network-only actions.
- __error__ — registration failed; check console and HTTPS.
## Custom service worker (optional)

If you need fine-grained caching, switch to `injectManifest` and implement `src-pwa/custom-service-worker.js` (template is already provided):

```js
/* eslint-env serviceworker */

/*
 * This file (which will be your service worker)
 * is picked up by the build system ONLY if
 * quasar.config.js > pwa > workboxMode is set to "injectManifest"
 */

import { clientsClaim } from "workbox-core";
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

self.skipWaiting();
clientsClaim();

// Use with precache injection
precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

// Non-SSR fallback to index.html
// Production SSR fallback to offline.html (except for dev)
if (process.env.MODE !== "ssr" || process.env.PROD) {
  registerRoute(
    new NavigationRoute(
      createHandlerBoundToURL(process.env.PWA_FALLBACK_HTML),
      { denylist: [/sw\.js$/, /workbox-(.)*\.js$/] }
    )
  );
}
```

Important: avoid caching sensitive wallet API responses. Keep caching limited to static assets unless you fully assess privacy/security.


### When to use `injectManifest`

- You need precise control over runtime caching (e.g., cache-first for images, network-first with short TTL for JSON).
- You want to add custom routes or background sync.
- You have complex navigation fallbacks.

For a wallet, defaulting to `generateSW` avoids accidental caching of sensitive data.

### Patterns to avoid in wallets

- Caching authenticated API responses or secrets.
- Using stale-while-revalidate for sensitive endpoints.
- Writing custom fetch handlers that log or store tokenized URLs.
## Web App Manifest

`src-pwa/manifest.json` defines identity, icons, screenshots, and protocol handlers:

```json
{
  "name": "Cashu.me",
  "short_name": "Cashu.me",
  "description": "A Cashu Ecash wallet for the web.",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#000000",
  "theme_color": "#000000",
  "protocol_handlers": [
    { "protocol": "web+cashu", "url": "/?token=%s" },
    { "protocol": "web+lightning", "url": "/?lightning=%s" }
  ],
  "icons": [
    { "src": "icons/icon-128x128.png", "sizes": "128x128", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-256x256.png", "sizes": "256x256", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-384x384.png", "sizes": "384x384", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ],
  "screenshots": [
    { "src": "/screenshots/narrow-1.png", "form_factor": "narrow", "sizes": "542x942", "type": "image/png", "label": "fullscreen view" },
    { "src": "/screenshots/narrow-2.png", "form_factor": "narrow", "sizes": "542x942", "type": "image/png", "label": "fullscreen view" },
    { "src": "/screenshots/wide-1.png", "form_factor": "wide", "sizes": "1910x932", "type": "image/png", "label": "fullscreen view" },
    { "src": "/screenshots/wide-2.png", "form_factor": "wide", "sizes": "1910x932", "type": "image/png", "label": "fullscreen view" }
  ]
}
```

The protocol handlers map incoming deep links to query params consumed in `WalletPage.vue`.


### ELI5: What is the manifest?

- A JSON file that tells the browser/OS how to install and present your app.
- Includes name, icons, background/theme colors, orientation, and optional features like protocol handlers.
- Screenshots help Android’s install UI look professional.

Tips:

- Provide both maskable and any-purpose icons for best results.
- Keep `start_url` and protocol handler URLs consistent with your router base.
## Protocol handlers and deep links

`web+cashu:<token>` and `web+lightning:<invoice>` are routed to `/?token=...` and `/?lightning=...` by the manifest. `WalletPage.vue` handles them in `created()`:

```js
// src/pages/WalletPage.vue (created)
let params = new URL(document.location).searchParams;
let hash = new URL(document.location).hash;

// get token to receive tokens from a link
if (params.get("token") || hash.includes("token")) {
  let tokenBase64 = params.get("token") || hash.split("token=")[1];
  // make sure to react only to tokens not in the users history
  let seen = false;
  for (var i = 0; i < this.historyTokens.length; i++) {
    var thisToken = this.historyTokens[i].token;
    if (thisToken == tokenBase64 && this.historyTokens[i].amount > 0) {
      seen = true;
    }
  }
  if (!seen) {
    // show receive token dialog
    this.receiveData.tokensBase64 = tokenBase64;
    this.showReceiveTokens = true;
  }
}

// get lightning invoice from a link
if (params.get("lightning")) {
  this.showParseDialog();
  this.payInvoiceData.input.request = params.get("lightning");
}
```

Additionally, welcome routing preserves the query/hash so deep links survive the onboarding flow:

```js
// src/pages/WalletPage.vue
showWelcomePage: function () {
  if (!useWelcomeStore().termsAccepted) {
    useWelcomeStore().showWelcome = true;
  }
  if (useWelcomeStore().showWelcome) {
    const currentQuery = window.location.search;
    const currentHash = window.location.hash;
    this.$router.push("/welcome" + currentQuery + currentHash);
  }
}
```


### ELI5: How deep links reach your app

- A link like `web+cashu:...` asks the browser/OS to open your installed PWA.
- If not installed, some browsers ask for permission or open the website with the parameters.
- In this repo, the manifest maps those links to `/?token=...` or `/?lightning=...`, and `WalletPage.vue` reads them on startup.

Do:

- Validate and sanitize incoming parameters before acting on them.
- Consider showing a confirmation UI before executing actions.

Don’t:

- Auto-execute money-moving actions without user interaction.
## Install experience

### Android/desktop (Chrome): capture `beforeinstallprompt`

`WalletPage.vue` listens for the event and stores it for later. A button appears only in browser display mode and when the deferred prompt exists.

```js
// src/pages/WalletPage.vue
registerPWAEventHook: function () {
  // register event listener for PWA install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    // Prevent the mini-infobar from appearing on mobile
    // e.preventDefault()
    // Stash the event so it can be triggered later.
    this.deferredPWAInstallPrompt = e;
    console.log(
      `'beforeinstallprompt' event was fired.`,
      this.getPwaDisplayMode()
    );
  });
},

getPwaDisplayMode: function () {
  const isStandalone = window.matchMedia(
    "(display-mode: standalone)"
  ).matches;
  if (document.referrer.startsWith("android-app://")) {
    return "twa";
  } else if (navigator.standalone || isStandalone) {
    return "standalone";
  }
  return "browser";
},

triggerPwaInstall: function () {
  // Show the install prompt
  // Note: this doesn't work with IOS, we do it with iOSPWAPrompt
  this.deferredPWAInstallPrompt.prompt();
  // Wait for the user to respond to the prompt
  this.deferredPWAInstallPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === "accepted") {
      console.log("User accepted the install prompt");
      this.setWelcomeDialogSeen();
    } else {
      console.log("User dismissed the install prompt");
    }
  });
}
```

Template condition and button:

```vue
<!-- src/pages/WalletPage.vue -->
<div style="margin-bottom: 0rem">
  <div class="row q-pt-sm">
    <div class="col-12 q-pt-xs">
      <q-btn
        class="q-mx-xs q-px-sm q-my-sm"
        outline
        size="0.6rem"
        v-if="
          getPwaDisplayMode() == 'browser' &&
          deferredPWAInstallPrompt != null
        "
        color="primary"
        @click="triggerPwaInstall()"
        ><b>{{ $t("WalletPage.install.text") }}</b
        ><q-tooltip>{{
          $t("WalletPage.install.tooltip")
        }}</q-tooltip></q-btn
      >
    </div>
  </div>
</div>
```

### iOS Safari: custom add-to-home-screen banner

`src/components/iOSPWAPrompt.vue` shows a bottom banner only on iPhone Safari and when not already installed:

```js
// src/components/iOSPWAPrompt.vue
mounted() {
  if (
    this.showIosPWAPromptLocal &&
    this.isiOsSafari() &&
    !this.isInStandaloneMode()
  ) {
    this.showIosPWAPrompt = true;
  }
},
methods: {
  isiOsSafari() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipod/.test(userAgent) && /safari/.test(userAgent);
  },
  isInStandaloneMode() {
    return "standalone" in window.navigator && window.navigator.standalone;
  },
}
```

### Chrome on Android: gentle banner

`src/components/AndroidPWAPrompt.vue` nudges users with a top-right banner when not installed:

```js
// src/components/AndroidPWAPrompt.vue
mounted() {
  if (
    this.showAndroidPWAPromptLocal &&
    this.isChromeOnAndroid() &&
    !this.isInStandaloneMode()
  ) {
    this.showAndroidPWAPrompt = true;
  }
},
methods: {
  isChromeOnAndroid() {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroid = /android/.test(userAgent);
    const isChrome =
      /chrome/.test(userAgent) && !/edge|edg|opr|opera/.test(userAgent);
    return isAndroid && isChrome;
  },
  isInStandaloneMode() {
    return window.matchMedia("(display-mode: standalone)").matches;
  },
}
```


## Offline strategy and global connectivity state

- __Caching__: With `generateSW`, only the built assets are precached. No runtime caching of wallet API requests is added.
- __UI__: `src/boot/base.js` tracks connectivity globally and updates on `online`/`offline` events:

```js
// src/boot/base.js
created: function () {
  addEventListener("offline", (event) => {
    this.g.offline = true;
  });
  addEventListener("online", (event) => {
    this.g.offline = false;
  });
  // ...
}
```

Use `this.g.offline` to disable actions or inform users.


### ELI5: Offline caching 101

- The app shell (UI chrome) loads from the cache even when offline.
- Real wallet functionality (balances, mints, invoices) still needs the network.
- Show clear offline states and disable actions that cannot work offline.

Security note for wallets:

- Do not cache sensitive responses or secrets.
- Be mindful of logs and analytics while handling tokenized URLs.
## Update flow

- `skipWaiting: true` + `clientsClaim: true` in `quasar.config.js` activate new SW immediately.
- Add a user-facing prompt in `src-pwa/register-service-worker.js` on `updated()`:

```js
updated(registration) {
  // Example: show a toast and reload on confirm
  // this.$q.notify({ message: 'Update available', actions: [{ label: 'Reload', handler: () => location.reload() }] })
}
```

This is not implemented in the repo by default; recommended for production.


### ELI5: How updates work

- The browser sees a new SW file → downloads it → installs it.
- Normally the new SW waits until all tabs close. With `skipWaiting` + `clientsClaim`, it takes over immediately.
- Because that can refresh the app unexpectedly, pair it with a prompt so the user decides when to reload.
## Favicons and icons

Quasar’s `index.html` includes small favicons:

```html
<!-- index.html -->
<link rel="icon" type="image/png" sizes="128x128" href="icons/128x128.png" />
<link rel="icon" type="image/png" sizes="96x96" href="icons/96x96.png" />
<link rel="icon" type="image/png" sizes="32x32" href="icons/32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="icons/16x16.png" />
<link rel="icon" type="image/ico" href="favicon.ico" />
```

Manifest icons live under `public/icons/icon-*.png`. Keep both sets present and correctly referenced.


## Dev, build, and test workflow

- __Dev__: `npm run dev` (HTTPS dev server at port 8080 per `quasar.config.js`). Service workers generally don’t run in dev; test PWA via a production build.
- __Build PWA__: `npm run build:pwa` (outputs under `dist/pwa`).
- __Serve build__: Use any HTTPS static server to serve `dist/pwa` for testing install/offline.
- __Lighthouse__: In Chrome DevTools → Lighthouse → Assess PWA installability, performance, best practices, accessibility.


## Porting checklist

- __Enable PWA__ in `quasar.config.js` and keep `generateSW` unless you need custom caching.
- __Provide icons/screenshots__ in `public/icons/` and reference in `src-pwa/manifest.json`.
- __Register SW__ via `src-pwa/register-service-worker.js`.
- __Install UX__: implement `beforeinstallprompt` capture in your main page and add platform banners (`iOSPWAPrompt.vue`, `AndroidPWAPrompt.vue`).
- __Display mode detection__: use `getPwaDisplayMode()` to conditionally show install UI only in browser mode.
- __Protocol handlers__: add to manifest and handle `token`/`lightning` query params in your landing route.
- __Connectivity UX__: respect `this.g.offline` and avoid network calls when offline.
- __Update prompt__: hook SW `updated()` and offer reload.


## Pitfalls and gotchas

- __Don’t cache wallet API calls__: Avoid runtime caching for sensitive endpoints; keep SW declarative and minimal.
- __Install prompt timing__: Only call `.prompt()` in direct user interaction handlers and after the `beforeinstallprompt` event was captured.
- __iOS nuances__: iOS Safari lacks `beforeinstallprompt`; use a custom banner and check `navigator.standalone`.
- __Protocol handlers require HTTPS and user interaction__: Browser support varies; ensure your site is installed or has permission before expecting automatic handling.
- __Icon paths__: Make sure `index.html` favicon paths and manifest icon paths match files in `public/icons/`.
- __SW scope__: If you customize `publicPath` or route base, ensure the SW scope and manifest URLs still resolve correctly.


## Appendix: File map and responsibilities

- `quasar.config.js` — PWA build config (`workboxMode`, filenames, Workbox options).
- `src-pwa/manifest.json` — App metadata, icons, screenshots, protocol handlers.
- `src-pwa/register-service-worker.js` — SW registration hooks (`updated()` is the place to wire a reload prompt).
- `src-pwa/custom-service-worker.js` — Template for `injectManifest` (custom caching strategies); not active by default.
- `src/pages/WalletPage.vue` — Install button condition, event capture, display-mode detection, protocol handler param parsing.
- `src/components/iOSPWAPrompt.vue` — iOS add-to-home-screen custom banner.
- `src/components/AndroidPWAPrompt.vue` — Android Chrome custom banner.
- `src/boot/base.js` — Global online/offline state.
- `index.html` — Favicons.

## How a PWA works (ELI5)

Think of a PWA like a website that can behave like an app when the browser gives it superpowers:

- __Web App Manifest__ tells the OS your app’s name, icons, colors, and how to launch it (like an app’s ID card). See `src-pwa/manifest.json`.
- __Service Worker__ is a small background helper that can cache files so your app loads fast and shows a basic UI even when offline. Quasar + Workbox generates this for you.
- __HTTPS__ is required for service workers and installability.
- __App Shell__ is the minimal HTML/CSS/JS for your UI. It’s precached so the app opens instantly; real data still needs the network.
- __Installability__ lets users “Add to Home Screen”. Chrome shows an install prompt event; iOS uses Safari’s “Add to Home Screen” flow.
- __Updates__ download in the background and activate. In this repo, updates take effect immediately (see `skipWaiting` + `clientsClaim`).

## Debugging PWAs (practical tips)

- __Chrome DevTools → Application panel__
  - Service Workers: check state, click “Update”/“Skip waiting”, see logs.
  - Clear Storage: check all boxes and “Clear site data” to reset caches.
- __Hard reload__: open DevTools and do “Empty cache and hard reload”.
- __Incognito__: good for testing fresh install flows.
- __Unregister SW__: in Application → Service Workers when things feel stuck.
- __Check HTTPS and scope__: SW only works on HTTPS and within its scope.

## Testing and Lighthouse deep dive

- __Lighthouse (Chrome DevTools)__: run PWA audits.
  - Installable: manifest present, icons, service worker, no HTTP.
  - Maskable icons: supply `purpose: "maskable"` for best Android UI.
  - Best Practices: ensure no mixed content, secure requests.
- __Manual checks__:
  - Install on Android and iOS, verify icon and splash behavior.
  - Go offline and confirm the app shell loads and shows offline messaging.

## From zero to PWA (with this repo as a template)

1. Create a Quasar app (Vue 3).
2. Enable PWA mode and keep `workboxMode: "generateSW"` to start.
3. Copy and adapt `src-pwa/manifest.json` and provide proper icons in `public/icons/` and screenshots in `public/screenshots/`.
4. Keep `src-pwa/register-service-worker.js` as-is and hook an update prompt in `updated()` later.
5. Add install UX in your main page like `src/pages/WalletPage.vue` (capture `beforeinstallprompt`, add install button, display-mode detection).
6. Add platform banners: `iOSPWAPrompt.vue` and `AndroidPWAPrompt.vue`.
7. Implement deep link handling (e.g., `token` and `lightning` params) on first route.
8. Track global connectivity in a boot file like `src/boot/base.js`.
9. Build with `npm run build:pwa` and test on a static HTTPS server.

## Glossary (quick definitions)

- __PWA__ — Progressive Web App, a website that can be installed and work offline (to a degree).
- __Service Worker__ — Background script that can cache files and intercept network requests.
- __Workbox__ — Google’s library to build/own the service worker.
- __App Shell__ — Minimal UI files cached for instant launches.
- __Manifest__ — JSON file with app identity and install instructions.
- __Protocol Handler__ — Lets your app handle custom links like `web+cashu:`.
- __Display Mode__ — How the app runs: browser, standalone, or TWA.
- __TWA__ — Trusted Web Activity; Android opens a full-screen Chrome tab from a native app.

## FAQ

- __Why no runtime caching of wallet APIs?__ Security and privacy. Avoid storing sensitive responses. Keep the SW minimal.
- __Why isn’t the install prompt showing?__ Ensure HTTPS, manifest with icons, an active SW, user engagement and no browser blocks. iOS Safari uses Add to Home Screen instead.
- __How do I apply updates safely?__ Keep `skipWaiting` + `clientsClaim`, but show a reload prompt on `updated()`.
- __Where do icons live?__ `public/icons/` and referenced in `src-pwa/manifest.json`. Small favicons are referenced in `index.html`.
- __Can I go native later?__ Yes. Capacitor can wrap the same PWA into iOS/Android binaries.

This guide mirrors the current repository code. If you change underlying behavior (e.g., adopt `injectManifest`), update the relevant sections accordingly.