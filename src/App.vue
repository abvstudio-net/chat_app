<template>
  <div>
    <!-- System banners -->
    <div class="banners">
      <div v-if="needRefresh" class="banner">
        <span>Update available. Reload to get the latest version.</span>
        <button class="btn btn-ghost" @click="reload">Reload</button>
      </div>
      <div v-if="showIosBanner" class="banner">
        <span>Install this app: tap Share, then "Add to Home Screen".</span>
        <button class="btn btn-ghost" @click="dismissIos">Dismiss</button>
      </div>
    </div>

    <header class="app-header">
      <div class="toolbar">
        <template v-if="isSettings">
          <button class="link-back" @click="goHome">&lt; Home</button>
        </template>
        <template v-else>
          <button class="btn btn-ghost hamburger-btn" aria-label="Menu" @click="toggleDrawer">
            <span class="hamburger" aria-hidden="true"></span>
          </button>
        </template>
        <div class="row gap middle" style="margin-left:auto;padding:0 16px;">
          <button v-if="showInstall" class="btn" @click="triggerInstall">Install</button>
          <span class="status-dot" :class="online ? 'ok' : 'bad'" :title="online ? 'Connected' : 'Offline'"></span>
        </div>
      </div>
    </header>

    <div class="side-drawer" :class="{ open: drawerOpen }">
      <div class="backdrop" @click="closeDrawer"></div>
      <aside class="panel" @click.stop>
        <nav class="nav">
          <!-- <div class="section-header">Navigate</div> -->
          <!-- <div class="section-header">Settings</div> -->
          <RouterLink class="nav-item" to="/settings" @click="closeDrawer">
            <div class="item-title">Settings</div>
            <!-- <div class="item-caption">App preferences</div> -->
          </RouterLink>
          <div class="section-header">Links</div>
          <a class="nav-item" :href="repoUrl" target="_blank" rel="noopener" @click="closeDrawer">
            <div class="item-title">GitHub</div>
            <!-- <div class="item-caption">Source code</div> -->
          </a>
        </nav>
      </aside>
    </div>

    <RouterView v-slot="{ Component }">
      <component :is="Component" :online="online" :last-online-at="lastOnlineAt" />
    </RouterView>

    <footer class="container small muted">
      <p>© {{ year }} Bitcoin PWA Template. Built for the web.</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRegisterSW } from 'virtual:pwa-register/vue';

const year = new Date().getFullYear();
const repoUrl = import.meta.env.VITE_REPO_URL || 'https://github.com/your-org/your-repo';

// Router + route state
const route = useRoute();
const router = useRouter();
const isSettings = computed(() => route.name === 'settings');
function goHome(){
  closeDrawer();
  router.push('/');
}

// Theme application
const LS_SETTINGS = 'btcPwa.settings';
function readTheme() {
  try { return (JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}').theme) || 'black'; } catch { return 'black'; }
}
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'bitcoin' ? '#2d293b' : '#000000');
}

// PWA update banner
const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });
const reload = () => updateServiceWorker();

// Online state
const online = ref(navigator.onLine);
const LAST_ONLINE_KEY = 'btcPwa.lastOnlineAt';
function loadLastOnline() {
  const v = Number(localStorage.getItem(LAST_ONLINE_KEY));
  return Number.isFinite(v) && v > 0 ? v : Date.now();
}
function saveLastOnline(ts) { try { localStorage.setItem(LAST_ONLINE_KEY, String(ts)); } catch {} }
const lastOnlineAt = ref(online.value ? loadLastOnline() : Number(localStorage.getItem(LAST_ONLINE_KEY)) || 0);
const onOnline = () => {
  online.value = true;
  lastOnlineAt.value = Date.now();
  saveLastOnline(lastOnlineAt.value);
};
const onOffline = () => {
  online.value = false;
};

// Install UX
let deferredPrompt = null;
const showInstall = ref(false);
function displayMode() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (document.referrer.startsWith('android-app://')) return 'twa';
  if (navigator.standalone || isStandalone) return 'standalone';
  return 'browser';
}
function refreshInstallUI() {
  showInstall.value = !!deferredPrompt && displayMode() === 'browser';
}
async function triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(() => null);
  deferredPrompt = null;
  refreshInstallUI();
}

// iOS banner
const IOS_DISMISS_KEY = 'btcPwa.iosBanner.dismissed';
const showIosBanner = ref(false);
function isIosSafari() {
  const ua = navigator.userAgent.toLowerCase();
  const isiOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|chrome|android/.test(ua);
  return isiOS && isSafari;
}
function maybeShowIosBanner() {
  const dismissed = localStorage.getItem(IOS_DISMISS_KEY) === '1';
  if (dismissed) { showIosBanner.value = false; return; }
  showIosBanner.value = isIosSafari() && displayMode() === 'browser';
}
function dismissIos() {
  localStorage.setItem(IOS_DISMISS_KEY, '1');
  showIosBanner.value = false;
}

// Side drawer
const drawerOpen = ref(false);
function toggleDrawer() { drawerOpen.value = !drawerOpen.value; }
function closeDrawer() { drawerOpen.value = false; }
function onKeydown(e) { if (e.key === 'Escape') closeDrawer(); }

onMounted(() => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    refreshInstallUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refreshInstallUI();
  });
  refreshInstallUI();
  maybeShowIosBanner();
  document.addEventListener('keydown', onKeydown);
  // Apply saved theme on app load
  applyTheme(readTheme());
  // Initialize last online timestamp if currently online
  if (navigator.onLine) {
    lastOnlineAt.value = Date.now();
    saveLastOnline(lastOnlineAt.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('keydown', onKeydown);
});
</script>
