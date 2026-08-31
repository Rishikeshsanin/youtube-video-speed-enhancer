(() => {
  "use strict";

  const DEFAULTS = Object.freeze({ speed: 1, step: 0.25, showToast: true });
  const STORAGE_KEY = "ytSpeedEnhancerSettings";
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 16;
  const SLIDER_MAX = 1000;

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

  const formatSpeed = (speed) => `${clampSpeed(speed).toFixed(2)}×`;

  function speedToSlider(speed) {
    const safe = clampSpeed(speed);
    const normalized = Math.log(safe / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED);
    return Math.round(Math.max(0, Math.min(1, normalized)) * SLIDER_MAX);
  }

  function sliderToSpeed(value) {
    const normalized = Math.max(0, Math.min(1, Number(value) / SLIDER_MAX));
    return clampSpeed(MIN_SPEED * (MAX_SPEED / MIN_SPEED) ** normalized);
  }

  function cacheElements() {
    [
      "statusDot",
      "statusCard",
      "statusText",
      "speedReadout",
      "effectivePill",
      "effectiveReadout",
      "speedRange",
      "speedInput",
      "decreaseSpeed",
      "increaseSpeed",
      "resetSpeed",
      "presetGrid",
      "jumpInput",
      "showToast",
      "engineLabel"
    ].forEach((id) => {
      elements[id] = byId(id);
    });
  }

  function setConnectionStatus(isConnected, text, tone = "neutral") {
    connected = isConnected;
    const classes = ["connected", "warning", "disconnected"];
    for (const className of classes) {
      elements.statusDot.classList.remove(className);
      elements.statusCard.classList.remove(className);
    }

    const className = isConnected ? tone : "disconnected";
    if (className !== "neutral") {
      elements.statusDot.classList.add(className);
      elements.statusCard.classList.add(className);
    }
    elements.statusText.textContent = text;

    const disabled = !isConnected;
    for (const element of [
      elements.speedRange,
      elements.speedInput,
      elements.decreaseSpeed,
      elements.increaseSpeed,
      elements.resetSpeed,
      elements.jumpInput,
      elements.showToast
    ]) {
      element.disabled = disabled;
    }

    elements.presetGrid.querySelectorAll("button").forEach((button) => {
      button.disabled = disabled;
    });
  }

  function updateRangeProgress(sliderValue) {
    const percentage = (Number(sliderValue) / SLIDER_MAX) * 100;
    elements.speedRange.style.setProperty(
      "--range-progress",
      `${Math.max(0, Math.min(100, percentage))}%`
    );
  }

  function updateHealth(nextState) {
    if (!connected) return;

    if (nextState.engineReady === false) {
      setConnectionStatus(false, "Player engine unavailable — reload the extension");
      elements.engineLabel.textContent = "Engine offline";
      return;
    }

    if (!nextState.videoCount) {
      setConnectionStatus(true, "Connected — waiting for a YouTube video", "warning");
      elements.engineLabel.textContent = "V3 engine · waiting";
      return;
    }

    if (nextState.effectiveMatch === false) {
      const actual = Number.isFinite(Number(nextState.actualSpeed))
        ? formatSpeed(nextState.actualSpeed)
        : "—";
      setConnectionStatus(
        true,
        `Applying ${formatSpeed(nextState.speed)} · player is ${actual}`,
        "warning"
      );
      elements.engineLabel.textContent = "V3 engine · recovering";
      return;
    }

    const lockCopy = nextState.hardLock ? " · reset guard active" : "";
    setConnectionStatus(
      true,
      `Synced at ${formatSpeed(nextState.speed)}${lockCopy}`,
      "connected"
    );
    elements.engineLabel.textContent = nextState.hardLock
      ? "V3 engine · locked"
      : "V3 engine · native sync";
  }

  function render(nextState = state) {
    state = { ...state, ...nextState };
    const speed = clampSpeed(state.speed);
    const sliderValue = speedToSlider(speed);

    elements.speedReadout.textContent = formatSpeed(speed);
    elements.speedRange.value = String(sliderValue);
    elements.speedInput.value = speed.toFixed(2);
    elements.jumpInput.value = String(state.step ?? DEFAULTS.step);
    elements.showToast.checked = state.showToast !== false;
    updateRangeProgress(sliderValue);

    const actual = Number.isFinite(Number(state.actualSpeed)) ? Number(state.actualSpeed) : null;
    elements.effectiveReadout.textContent = actual == null ? "—" : formatSpeed(actual);
    elements.effectivePill.classList.toggle("matching", state.effectiveMatch === true);
    elements.effectivePill.classList.toggle("mismatch", state.effectiveMatch === false);
    elements.effectivePill.classList.toggle("idle", state.effectiveMatch == null);

    elements.presetGrid.querySelectorAll("[data-speed]").forEach((button) => {
      button.classList.toggle("active", Math.abs(Number(button.dataset.speed) - speed) < 0.001);
    });

    updateHealth(state);
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
      setConnectionStatus(true, "Preview mode — controls are ready", "connected");
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
      connected = true;
      render(response.state);
    } catch (_error) {
      setConnectionStatus(false, "Open a YouTube video, refresh it, then reopen this popup");
    }
  }

  async function updateSpeed(speed, { immediate = true } = {}) {
    const nextSpeed = clampSpeed(speed);
    render({ speed: nextSpeed, effectiveMatch: null });
    if (!connected) return;

    const commit = async () => {
      try {
        const response = await sendMessage({ type: "SET_SPEED", speed: nextSpeed });
        if (!response?.ok) throw new Error(response?.error || "Speed update failed");
        if (response.state) render(response.state);
      } catch (_error) {
        setConnectionStatus(false, "Connection lost — refresh YouTube and reopen the popup");
      }
    };

    clearTimeout(speedCommitTimer);
    if (immediate) {
      await commit();
    } else {
      speedCommitTimer = setTimeout(commit, 75);
    }
  }

  async function runSimpleCommand(message) {
    if (!connected) return;
    try {
      const response = await sendMessage(message);
      if (!response?.ok) throw new Error(response?.error || "Command failed");
      if (response.state) render(response.state);
    } catch (_error) {
      setConnectionStatus(false, "Connection lost — refresh YouTube and reopen the popup");
    }
  }

  function bindEvents() {
    elements.speedRange.addEventListener("input", (event) => {
      void updateSpeed(sliderToSpeed(event.target.value), { immediate: false });
    });

    elements.speedRange.addEventListener("change", (event) => {
      void updateSpeed(sliderToSpeed(event.target.value));
    });

    elements.speedInput.addEventListener("change", (event) => {
      void updateSpeed(event.target.value);
    });

    elements.speedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.currentTarget.blur();
    });

    elements.decreaseSpeed.addEventListener("click", () =>
      void runSimpleCommand({ type: "NUDGE_SPEED", direction: -1 })
    );
    elements.increaseSpeed.addEventListener("click", () =>
      void runSimpleCommand({ type: "NUDGE_SPEED", direction: 1 })
    );
    elements.resetSpeed.addEventListener("click", () => void updateSpeed(1));

    elements.presetGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-speed]");
      if (!button) return;
      void updateSpeed(Number(button.dataset.speed));
    });

    elements.jumpInput.addEventListener("change", (event) =>
      void runSimpleCommand({ type: "SET_STEP", step: Number(event.target.value) })
    );

    elements.showToast.addEventListener("change", (event) =>
      void runSimpleCommand({ type: "SET_SHOW_TOAST", showToast: event.target.checked })
    );
  }

  async function start() {
    cacheElements();
    bindEvents();
    render(await loadStoredState());
    await connectToActiveTab();
  }

  document.addEventListener("DOMContentLoaded", () => {
    void start().catch((error) => {
      console.error("[YTSE popup] Failed to start", error);
      if (elements.statusText) setConnectionStatus(false, "Extension could not start — reload it");
    });
  });
})();
