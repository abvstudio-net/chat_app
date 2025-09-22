<template>
  <main class="container">
    <section class="card">
      <h2>Settings</h2>
      <p class="small muted">These settings persist in your browser (LocalStorage) and are used by the Home page.</p>
      <ul class="kv small" style="margin-top:8px">
        <li><span>Connection</span><span>{{ connLabel }}</span></li>
      </ul>
      <div class="row gap" style="margin-top:8px">
        <label style="width:100%">
          <span>Theme</span>
          <select id="theme-select" v-model="settings.theme" @change="onThemeChange">
            <option value="black">Black (flat)</option>
            <option value="bitcoin">Bitcoin</option>
          </select>
        </label>
      </div>
      <div class="row gap" style="margin-top:8px">
        <label><input id="auto-height-settings" type="checkbox" v-model="settings.autoHeight" /> Auto-refresh block height</label>
        <label><input id="auto-price-settings" type="checkbox" v-model="settings.autoPrice" /> Auto-refresh price</label>
      </div>
      <div class="row gap" style="margin-top:8px">
        <label>
          <span>Poll interval (sec)</span>
          <input id="poll-interval-settings" type="number" min="5" :value="settings.pollIntervalSec" @input="onIntervalInput" />
        </label>
      </div>
      <p class="hint small" style="margin-top:8px">Auto-refresh runs when the Home page is open. External API calls are network-only.</p>
    </section>
  </main>
</template>

<script setup>
import { reactive, watchEffect, onMounted, computed, ref, onBeforeUnmount } from 'vue';

const LS_SETTINGS = 'btcPwa.settings';
function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function save(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// Props from App for connection info
const props = defineProps({
  online: { type: Boolean, default: typeof navigator !== 'undefined' ? navigator.onLine : true },
  lastOnlineAt: { type: Number, default: 0 },
});

const settings = reactive(load(LS_SETTINGS, {
  theme: 'black',
  autoHeight: false,
  autoPrice: false,
  pollIntervalSec: 30,
}));

function persist() { save(LS_SETTINGS, settings); }

function onIntervalInput(e) {
  const v = clamp(Number(e.target.value) || 30, 5, 3600);
  settings.pollIntervalSec = v;
  e.target.value = String(v);
  persist();
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'bitcoin' ? '#2d293b' : '#000000');
}

function onThemeChange(){
  applyTheme(settings.theme);
  persist();
}

// Connection status label
const tick = ref(0);
const connLabel = computed(() => {
  if (props.online) return 'Connected';
  const ts = props.lastOnlineAt || 0;
  if (!ts) return 'Disconnected';
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `Last connected ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Last connected ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Last connected ${h}h ago`;
  const d = Math.floor(h / 24);
  return `Last connected ${d}d ago`;
});

// Persist toggles immediately
watchEffect(persist);

onMounted(() => {
  applyTheme(settings.theme);
  // update relative time label
  tick.value = 0;
  tickTimer = setInterval(() => { tick.value++; }, 1000);
});

let tickTimer = null;
onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>
