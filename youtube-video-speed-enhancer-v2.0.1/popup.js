(() => {
  "use strict";

  const DEFAULTS = Object.freeze({ speed: 1, step: 0.25, showToast: true });
  const STORAGE_KEY = "ytSpeedEnhancerSettings";
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 10;

  const elements = {};
  let activeTabId = null;
  let connected = false;
  let state = { ...DEFAULTS };
  let speedCommitTimer = null;

  const byId = (id) => document.getElementById(id);

  const round = (value, places = 2) => {
    const factor = 10 ** places;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };

  const clampSpeed = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return state.speed;
    return round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, parsed)));
  };

  const formatSpeed = (speed) => {
    const value = round(speed);
    return `${Number.isInteger(value) ? value.toFixed(2) : value.toFixed(2)}×`;
  };

  function cacheElements() {
    [
      "statusDot",
      "statusCard",
      "statusText",
      "speedReadout",
      "speedRange",
      "speedInput",
      "decreaseSpeed",
      "increaseSpeed",
      "resetSpeed",
      "presetGrid",
      "jumpInput",
      "showToast"
    ].forEach((id) => {
      elements[id] = byId(id);
    });
  }

  function setConnectionStatus(isConnected, text) {
    connected = isConnected;
    elements.statusDot.classList.toggle("connected", isConnected);
    elements.statusDot.classList.toggle("disconnected", !isConnected);
    elements.statusCard.classList.toggle("connected", isConnected);
    elements.statusCard.classList.toggle("disconnected", !isConnected);
    elements.statusText.textContent = text;

    for (const element of [
      elements.speedRange,
      elements.speedInput,
      elements.decreaseSpeed,
      elements.increaseSpeed,
      elements.resetSpeed,
      elements.jumpInput,
      elements.showToast
    ]) {
      element.disabled = !isConnected;
    }

    elements.presetGrid.querySelectorAll("button").forEach((button) => {
      button.disabled = !isConnected;
    });
  }

  function updateRangeProgress(speed) {
    const percentage = ((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
    elements.speedRange.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, percentage))}%`);
  }

  function render(nextState = state) {
    state = { ...state, ...nextState };
    const speed = clampSpeed(state.speed);

    elements.speedReadout.textContent = formatSpeed(speed);
    elements.speedRange.value = String(speed);
    elements.speedInput.value = String(speed);
    elements.jumpInput.value = String(state.step ?? DEFAULTS.step);
    elements.showToast.checked = state.showToast !== false;
    updateRangeProgress(speed);

    elements.presetGrid.querySelectorAll("[data-speed]").forEach((button) => {
      button.classList.toggle("active", Math.abs(Number(button.dataset.speed) - speed) < 0.001);
    });
  }

  async function loadStoredState() {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) return DEFAULTS;
    const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULTS });
    return { ...DEFAULTS, ...(stored[STORAGE_KEY] || {}) };
  }

  async function sendMessage(message) {
    if (!activeTabId || typeof chrome === "undefined" || !chrome.tabs?.sendMessage) {
      throw new Error("YouTube tab is not available");
    }
    return chrome.tabs.sendMessage(activeTabId, message);
  }

  async function connectToActiveTab() {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) {
      setConnectionStatus(true, "Preview mode — controls are ready");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;

    if (!activeTabId) {
      setConnectionStatus(false, "No active tab found");
      return;
    }

    try {
      const response = await sendMessage({ type: "PING" });
      if (!response?.ok) throw new Error(response?.error || "No content script response");
      render(response.state);
      setConnectionStatus(true, "Connected — changes apply instantly");
    } catch (_error) {
      setConnectionStatus(false, "Open a YouTube video, then reopen this popup");
    }
  }

  async function updateSpeed(speed, { immediate = true } = {}) {
    const nextSpeed = clampSpeed(speed);
    render({ speed: nextSpeed });
    if (!connected) return;

    const commit = async () => {
      try {
        const response = await sendMessage({ type: "SET_SPEED", speed: nextSpeed });
        if (response?.state) render(response.state);
      } catch (_error) {
        setConnectionStatus(false, "Connection lost — reopen on a YouTube tab");
      }
    };

    clearTimeout(speedCommitTimer);
    if (immediate) {
      await commit();
    } else {
      speedCommitTimer = setTimeout(commit, 80);
    }
  }

  function bindEvents() {
    elements.speedRange.addEventListener("input", (event) => {
      void updateSpeed(event.target.value, { immediate: false });
    });

    elements.speedRange.addEventListener("change", (event) => {
      void updateSpeed(event.target.value);
    });

    elements.speedInput.addEventListener("change", (event) => {
      void updateSpeed(event.target.value);
    });

    elements.speedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
    });

    elements.decreaseSpeed.addEventListener("click", async () => {
      if (!connected) return;
      try {
        const response = await sendMessage({ type: "NUDGE_SPEED", direction: -1 });
        if (response?.state) render(response.state);
      } catch (_error) {
        setConnectionStatus(false, "Connection lost — reopen on a YouTube tab");
      }
    });

    elements.increaseSpeed.addEventListener("click", async () => {
      if (!connected) return;
      try {
        const response = await sendMessage({ type: "NUDGE_SPEED", direction: 1 });
        if (response?.state) render(response.state);
      } catch (_error) {
        setConnectionStatus(false, "Connection lost — reopen on a YouTube tab");
      }
    });

    elements.resetSpeed.addEventListener("click", () => void updateSpeed(1));

    elements.presetGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-speed]");
      if (!button) return;
      void updateSpeed(Number(button.dataset.speed));
    });

    elements.jumpInput.addEventListener("change", async (event) => {
      const step = Number(event.target.value);
      render({ step });
      if (!connected) return;
      try {
        const response = await sendMessage({ type: "SET_STEP", step });
        if (response?.state) render(response.state);
      } catch (_error) {
        setConnectionStatus(false, "Connection lost — reopen on a YouTube tab");
      }
    });

    elements.showToast.addEventListener("change", async (event) => {
      const showToast = event.target.checked;
      render({ showToast });
      if (!connected) return;
      try {
        const response = await sendMessage({ type: "SET_SHOW_TOAST", showToast });
        if (response?.state) render(response.state);
      } catch (_error) {
        setConnectionStatus(false, "Connection lost — reopen on a YouTube tab");
      }
    });
  }

  async function start() {
    cacheElements();
    bindEvents();
    render(await loadStoredState());
    await connectToActiveTab();
  }

  document.addEventListener("DOMContentLoaded", () => {
    void start().catch((error) => {
      console.error("[YT Speed Enhancer] Popup failed to start", error);
      if (elements.statusText) setConnectionStatus(false, "Extension could not start — reload it in Chrome");
    });
  });
})();
