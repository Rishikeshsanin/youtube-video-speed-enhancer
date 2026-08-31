(() => {
  "use strict";

  if (globalThis.__YT_SPEED_ENHANCER_V3__) return;
  globalThis.__YT_SPEED_ENHANCER_V3__ = true;

  const DEFAULTS = Object.freeze({
    speed: 1,
    step: 0.25,
    showToast: true
  });

  const MIN_SPEED = 0.25;
  const MAX_SPEED = 16;
  const STORAGE_KEY = "ytSpeedEnhancerSettings";
  const COMMAND_EVENT = "ytse:v3:command";
  const STATE_EVENT = "ytse:v3:state";
  const COMMAND_ATTR = "data-ytse-command";
  const STATE_ATTR = "data-ytse-state";

  let settings = { ...DEFAULTS };
  let engineState = {
    engineVersion: 3,
    ready: false,
    configured: false,
    requestedSpeed: 1,
    actualSpeed: null,
    effectiveMatch: null,
    videoCount: 0,
    hardLock: false,
    prototypeGuard: false,
    interceptedResets: 0
  };
  let toastTimer = null;
  let started = false;
  let commandCounter = 0;

  const round = (value, places = 2) => {
    const factor = 10 ** places;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };

  const clampSpeed = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return settings.speed;
    return round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, parsed)));
  };

  const clampStep = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULTS.step;
    return round(Math.min(2, Math.max(0.05, parsed)));
  };

  const sameRate = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;
  const getRoot = () => document.documentElement;

  function readEngineState() {
    const root = getRoot();
    if (!root) return engineState;

    const raw = root.getAttribute(STATE_ATTR);
    if (!raw) return engineState;

    try {
      const next = JSON.parse(raw);
      if (next && typeof next === "object") {
        engineState = { ...engineState, ...next, ready: next.ready !== false };
      }
    } catch (_error) {
      // Keep the previous state if the page modifies the diagnostic attribute.
    }

    return engineState;
  }

  function dispatchEngineCommand(type, payload = {}) {
    const root = getRoot();
    if (!root) return engineState;

    commandCounter += 1;
    const command = {
      id: commandCounter,
      type,
      ...payload
    };

    root.setAttribute(COMMAND_ATTR, JSON.stringify(command));
    root.dispatchEvent(new Event(COMMAND_EVENT));
    root.removeAttribute(COMMAND_ATTR);
    return readEngineState();
  }

  function configureEngine(reason = "settings") {
    return dispatchEngineCommand("CONFIGURE", {
      speed: settings.speed,
      reason
    });
  }

  function formatSpeed(speed) {
    const value = round(speed);
    return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, "")}×`;
  }

  function showToast(speed = settings.speed) {
    if (!settings.showToast) return;

    let toast = document.getElementById("yt-speed-enhancer-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "yt-speed-enhancer-toast";
      Object.assign(toast.style, {
        position: "fixed",
        top: "78px",
        right: "24px",
        zIndex: "2147483647",
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "10px 13px",
        border: "1px solid rgba(255,255,255,.14)",
        borderRadius: "12px",
        color: "#fff",
        background: "rgba(12,14,19,.9)",
        boxShadow: "0 12px 40px rgba(0,0,0,.38)",
        backdropFilter: "blur(12px)",
        webkitBackdropFilter: "blur(12px)",
        fontFamily: "Roboto, Arial, sans-serif",
        fontSize: "13px",
        fontWeight: "600",
        letterSpacing: ".01em",
        opacity: "0",
        transform: "translateY(-5px) scale(.98)",
        transition: "opacity 140ms ease, transform 140ms ease",
        pointerEvents: "none"
      });
      document.documentElement.appendChild(toast);
    }

    const mode = engineState.hardLock ? " · locked" : "";
    toast.textContent = `Playback ${formatSpeed(speed)}${mode}`;

    clearTimeout(toastTimer);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0) scale(1)";
    });

    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-5px) scale(.98)";
    }, 1100);
  }

  async function persistSettings() {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  }

  function getState() {
    readEngineState();
    return {
      ...settings,
      actualSpeed: Number.isFinite(Number(engineState.actualSpeed))
        ? round(engineState.actualSpeed)
        : null,
      effectiveMatch: engineState.effectiveMatch,
      engineReady: engineState.ready === true,
      engineVersion: engineState.engineVersion ?? null,
      videoCount: Number(engineState.videoCount) || 0,
      hardLock: engineState.hardLock === true,
      prototypeGuard: engineState.prototypeGuard === true,
      playerApiAvailable: engineState.playerApiAvailable === true,
      playerApiSynced: engineState.playerApiSynced === true,
      playerNativeRate: engineState.playerNativeRate === true,
      interceptedResets: Number(engineState.interceptedResets) || 0,
      lastInterceptedRate: engineState.lastInterceptedRate ?? null,
      minSpeed: MIN_SPEED,
      maxSpeed: MAX_SPEED,
      url: location.href
    };
  }

  async function setSpeed(value, { announce = true, persist = true } = {}) {
    settings.speed = clampSpeed(value);
    configureEngine("set-speed");
    if (persist) await persistSettings();
    if (announce) showToast(settings.speed);
    return getState();
  }

  async function setStep(value, { persist = true } = {}) {
    settings.step = clampStep(value);
    if (persist) await persistSettings();
    return getState();
  }

  async function setShowToast(value, { persist = true } = {}) {
    settings.showToast = Boolean(value);
    if (persist) await persistSettings();
    return getState();
  }

  function shouldIgnoreKeyboardEvent(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return true;

    const target = event.target;
    if (!(target instanceof Element)) return false;

    return Boolean(
      target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
    );
  }

  function onKeyDown(event) {
    if (shouldIgnoreKeyboardEvent(event)) return;

    const increase = event.key === "+" || event.key === "=";
    const decrease = event.key === "-" || event.key === "_";
    const reset = event.key === "\\";
    if (!increase && !decrease && !reset) return;

    event.preventDefault();
    event.stopPropagation();

    if (reset) {
      void setSpeed(1);
      return;
    }

    const delta = increase ? settings.step : -settings.step;
    void setSpeed(settings.speed + delta);
  }

  function installMessageHandler() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return undefined;

      const respond = async () => {
        switch (message.type) {
          case "PING":
          case "GET_STATE":
            dispatchEngineCommand("GET_STATE");
            return { ok: true, state: getState() };
          case "SET_SPEED":
            return { ok: true, state: await setSpeed(message.speed) };
          case "SET_STEP":
            return { ok: true, state: await setStep(message.step) };
          case "SET_SHOW_TOAST":
            return { ok: true, state: await setShowToast(message.showToast) };
          case "NUDGE_SPEED": {
            const direction = Number(message.direction) >= 0 ? 1 : -1;
            return { ok: true, state: await setSpeed(settings.speed + settings.step * direction) };
          }
          case "RESET_SPEED":
            return { ok: true, state: await setSpeed(1) };
          default:
            return { ok: false, error: "Unknown message type" };
        }
      };

      respond()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));

      return true;
    });
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULTS });
      const saved = stored[STORAGE_KEY] || DEFAULTS;
      settings = {
        speed: clampSpeed(saved.speed ?? DEFAULTS.speed),
        step: clampStep(saved.step ?? DEFAULTS.step),
        showToast: saved.showToast !== false
      };
    } catch (error) {
      console.debug("[YTSE bridge] Could not load settings; using defaults", error);
      settings = { ...DEFAULTS };
    }
  }

  function installStorageSync() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes[STORAGE_KEY]?.newValue) return;

      const next = changes[STORAGE_KEY].newValue;
      const nextSettings = {
        speed: clampSpeed(next.speed ?? settings.speed),
        step: clampStep(next.step ?? settings.step),
        showToast: next.showToast !== false
      };

      const speedChanged = !sameRate(nextSettings.speed, settings.speed);
      settings = nextSettings;
      if (speedChanged) configureEngine("storage-sync");
    });
  }

  async function start() {
    if (started) return;
    started = true;

    const root = getRoot();
    if (root) {
      root.addEventListener(STATE_EVENT, readEngineState);
      readEngineState();
    }

    await loadSettings();
    installMessageHandler();
    installStorageSync();
    document.addEventListener("keydown", onKeyDown, true);
    configureEngine("startup");
    console.info("[YTSE bridge] v3 isolated bridge ready", getState());
  }

  void start();
})();
