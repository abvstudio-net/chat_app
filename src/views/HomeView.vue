<template>
  <main class="container">
    <!-- Network status card removed; header shows status via dot -->

    <section class="grid-2">
      <div class="card">
        <div class="row space-between middle">
          <h3>Block height</h3>
          <button class="btn" :disabled="loadingHeight" @click="refreshHeight">{{ loadingHeight ? 'Loading…' : 'Refresh' }}</button>
        </div>
        <div class="metric">
          <span class="value">{{ state.height ?? '—' }}</span>
        </div>
        <ul class="kv small muted">
          <li><span>Updated</span><span>{{ fmt(state.heightUpdated) }}</span></li>
          <li><span>Source</span><span>{{ state.heightSource || '—' }}</span></li>
        </ul>
      </div>

      <div class="card">
        <div class="row space-between middle">
          <h3>Price (USD)</h3>
          <button class="btn" :disabled="loadingPrice" @click="refreshPrice">{{ loadingPrice ? 'Loading…' : 'Refresh' }}</button>
        </div>
        <div class="metric">
          <span class="prefix">$</span>
          <span class="value">{{ state.priceUsd != null ? state.priceUsd.toFixed(2) : '—' }}</span>
        </div>
        <ul class="kv small muted">
          <li><span>Updated</span><span>{{ fmt(state.priceUpdated) }}</span></li>
          <li><span>Source</span><span>{{ state.priceSource || '—' }}</span></li>
        </ul>
      </div>
    </section>

    <section class="card">
      <h3>USD ↔ sats converter</h3>
      <div class="grid-2">
        <label>
          <span>USD</span>
          <input ref="usdEl" type="number" step="0.01" min="0" v-model="usdInput" @input="onUsdInput" placeholder="0.00" />
        </label>
        <label>
          <span>Satoshis</span>
          <input ref="satsEl" type="number" step="1" min="0" v-model="satsInput" @input="onSatsInput" placeholder="0" />
        </label>
      </div>
      <p class="hint small" v-if="state.priceUsd == null">Fetch price to enable converter.</p>
    </section>
    
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, toRefs } from 'vue';

// Props from App for network status
const props = defineProps({
  online: { type: Boolean, default: typeof navigator !== 'undefined' ? navigator.onLine : true },
  lastOnlineAt: { type: Number, default: 0 },
});
const { online } = toRefs(props);

// Local storage helpers
const LS_STATE = 'btcPwa.state';
const LS_SETTINGS = 'btcPwa.settings';
function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function save(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
}
function ts() { return new Date().toISOString(); }
function fmt(dtIso) { if (!dtIso) return 'never'; const d = new Date(dtIso); return d.toLocaleString(); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// Reactive state
const state = reactive(load(LS_STATE, {
  height: null,
  heightUpdated: null,
  heightSource: '',
  priceUsd: null,
  priceUpdated: null,
  priceSource: '',
}));

const settings = reactive(load(LS_SETTINGS, {
  autoHeight: false,
  autoPrice: false,
  pollIntervalSec: 30,
}));

// Persist settings/state when changed
function persistState() { save(LS_STATE, state); }
function persistSettings() { save(LS_SETTINGS, settings); setupPolling(); }

// Fetch utils
async function fetchText(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.text(); }
async function fetchJson(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

async function getBlockHeight() {
  const tries = [
    async () => ({ value: parseInt(await fetchText('https://mempool.space/api/blocks/tip/height'), 10), source: 'mempool.space' }),
    async () => ({ value: parseInt(await fetchText('https://blockstream.info/api/blocks/tip/height'), 10), source: 'blockstream.info' }),
    async () => { const j = await fetchJson('https://api.blockcypher.com/v1/btc/main'); return { value: j.height|0, source: 'blockcypher' }; },
  ];
  let lastErr;
  for (const t of tries) { try { const r = await t(); if (Number.isFinite(r.value)) return r; } catch (e) { lastErr = e; } }
  throw lastErr || new Error('All sources failed');
}

async function getPriceUsd() {
  const tries = [
    async () => { const j = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'); return { value: Number(j.bitcoin.usd), source: 'coingecko' }; },
    async () => { const j = await fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); return { value: Number(j.price), source: 'binance' }; },
  ];
  let lastErr;
  for (const t of tries) { try { const r = await t(); if (Number.isFinite(r.value)) return r; } catch (e) { lastErr = e; } }
  throw lastErr || new Error('All sources failed');
}

// Height/price actions
const loadingHeight = ref(false);
const loadingPrice = ref(false);

async function refreshHeight() {
  loadingHeight.value = true;
  try {
    const r = await getBlockHeight();
    state.height = r.value;
    state.heightUpdated = ts();
    state.heightSource = r.source;
    persistState();
  } catch (e) {
    state.heightSource = 'failed';
  } finally {
    loadingHeight.value = false;
  }
}

async function refreshPrice() {
  loadingPrice.value = true;
  try {
    const r = await getPriceUsd();
    state.priceUsd = r.value;
    state.priceUpdated = ts();
    state.priceSource = r.source;
    persistState();
    // re-run converter if one side has input
    if (document.activeElement !== usdEl.value && usdInput.value) onUsdInput();
    if (document.activeElement !== satsEl.value && satsInput.value) onSatsInput();
  } catch (e) {
    state.priceSource = 'failed';
  } finally {
    loadingPrice.value = false;
  }
}

// Converter
const usdInput = ref('');
const satsInput = ref('');
const usdEl = ref(null);
const satsEl = ref(null);
let updatingConverter = false;
function satsPerBtc() { return 100_000_000; }
function onUsdInput() {
  if (updatingConverter) return; updatingConverter = true;
  const usd = Number(usdInput.value);
  if (!Number.isFinite(usd) || usd < 0 || !state.priceUsd) { satsInput.value = ''; updatingConverter = false; return; }
  const sats = Math.floor((usd / state.priceUsd) * satsPerBtc());
  satsInput.value = String(sats);
  updatingConverter = false;
}
function onSatsInput() {
  if (updatingConverter) return; updatingConverter = true;
  const sats = Number(satsInput.value);
  if (!Number.isFinite(sats) || sats < 0 || !state.priceUsd) { usdInput.value = ''; updatingConverter = false; return; }
  const usd = (sats / satsPerBtc()) * state.priceUsd;
  usdInput.value = usd.toFixed(2);
  updatingConverter = false;
}

// Polling
let pollTimer = null;
function setupPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (!settings.autoHeight && !settings.autoPrice) return;
  const iv = clamp(Number(settings.pollIntervalSec) || 30, 5, 3600);
  const tick = async () => {
    if (settings.autoHeight) refreshHeight();
    if (settings.autoPrice) refreshPrice();
  };
  tick();
  pollTimer = setInterval(tick, iv * 1000);
}

// Ensure polling is initialized
onMounted(async () => {
  persistSettings();
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

// Initial populate if online
onMounted(() => {
  if (props.online) {
    refreshHeight().catch(() => {});
    refreshPrice().catch(() => {});
  }
});

// Persist on changes
watch(() => settings.autoHeight, persistSettings);
watch(() => settings.autoPrice, persistSettings);
watch(() => settings.pollIntervalSec, persistSettings);
watch(state, persistState, { deep: true });
</script>
