(() => {
  "use strict";

  if (globalThis.__YT_SPEED_ENHANCER_V2__) return;
  globalThis.__YT_SPEED_ENHANCER_V2__ = true;

  const DEFAULTS = Object.freeze({
    speed: 1,
    step: 0.25,
    showToast: true
  });

  const MIN_SPEED = 0.25;
  const MAX_SPEED = 10;
  const STORAGE_KEY = "ytSpeedEnhancerSettings";
  const REAPPLY_DELAYS = [0, 40, 120, 300, 750, 1500];
  const WATCHDOG_INTERVAL = 1000;

  let settings = { ...DEFAULTS };
  let toastTimer = null;
  let reapplyTimers = [];
  let started = false;
  const observedVideos = new WeakSet();

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

  const getVideos = () => Array.from(document.querySelectorAll("video"));

  function sameRate(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.001;
  }

  function enforceVideoRate(video, speed = settings.speed) {
    if (!(video instanceof HTMLVideoElement)) return false;

    const safeSpeed = clampSpeed(speed);
    try {
      if (!sameRate(video.defaultPlaybackRate, safeSpeed)) {
        video.defaultPlaybackRate = safeSpeed;
      }
      if (!sameRate(video.playbackRate, safeSpeed)) {
        video.playbackRate = safeSpeed;
      }
      return sameRate(video.playbackRate, safeSpeed);
    } catch (error) {
      console.debug("[YT Speed Enhancer] Could not update a video element.", error);
      return false;
    }
  }

  function attachVideoGuard(video) {
    if (!(video instanceof HTMLVideoElement) || observedVideos.has(video)) return;
    observedVideos.add(video);

    const reassert = () => {
      if (!sameRate(video.playbackRate, settings.speed)) {
        // YouTube can re-apply one of its own menu rates immediately after our
        // write. Reassert on the next microtask and again shortly afterwards.
        queueMicrotask(() => enforceVideoRate(video));
        setTimeout(() => enforceVideoRate(video), 25);
        setTimeout(() => enforceVideoRate(video), 120);
      }
    };

    video.addEventListener("ratechange", reassert, true);
    video.addEventListener("loadedmetadata", () => enforceVideoRate(video), true);
    video.addEventListener("canplay", () => enforceVideoRate(video), true);
    video.addEventListener("playing", () => enforceVideoRate(video), true);
    video.addEventListener("emptied", () => scheduleReapply(), true);
  }

  function applySpeed(speed = settings.speed) {
    const safeSpeed = clampSpeed(speed);
    let applied = 0;

    for (const video of getVideos()) {
      attachVideoGuard(video);
      if (enforceVideoRate(video, safeSpeed)) applied += 1;
    }

    return applied;
  }

  function getActualSpeed() {
    const videos = getVideos();
    if (!videos.length) return null;
    return round(videos[0].playbackRate);
  }

  function formatSpeed(speed) {
    const rounded = round(speed);
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, "")}×`;
  }

  function showToast(speed = settings.speed) {
    if (!settings.showToast) return;

    let toast = document.getElementById("yt-speed-enhancer-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "yt-speed-enhancer-toast";
      Object.assign(toast.style, {
        position: "fixed",
        top: "82px",
        right: "24px",
        zIndex: "2147483647",
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "10px 13px",
        border: "1px solid rgba(255,255,255,.14)",
        borderRadius: "12px",
        color: "#fff",
        background: "rgba(12,14,19,.88)",
        boxShadow: "0 12px 40px rgba(0,0,0,.35)",
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

    toast.innerHTML = `
      <span style="width:7px;height:7px;border-radius:999px;background:#ff4545;box-shadow:0 0 0 4px rgba(255,69,69,.12)"></span>
      <span>Playback <strong style="font-size:15px;margin-left:2px">${formatSpeed(speed)}</strong></span>
    `;

    clearTimeout(toastTimer);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0) scale(1)";
    });

    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-5px) scale(.98)";
    }, 1150);
  }

  async function persistSettings() {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  }

  async function setSpeed(value, { announce = true, persist = true } = {}) {
    settings.speed = clampSpeed(value);
    applySpeed(settings.speed);
    scheduleReapply();
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

  function getState() {
    return {
      ...settings,
      actualSpeed: getActualSpeed(),
      minSpeed: MIN_SPEED,
      maxSpeed: MAX_SPEED,
      videoCount: getVideos().length,
      url: location.href
    };
  }

  function scheduleReapply() {
    for (const timer of reapplyTimers) clearTimeout(timer);
    reapplyTimers = REAPPLY_DELAYS.map((delay) =>
      setTimeout(() => applySpeed(settings.speed), delay)
    );
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
    if (!increase && !decrease) return;

    event.preventDefault();
    event.stopPropagation();

    const delta = increase ? settings.step : -settings.step;
    void setSpeed(settings.speed + delta);
  }

  function onVideoLifecycleEvent(event) {
    if (event.target instanceof HTMLVideoElement) {
      attachVideoGuard(event.target);
      setTimeout(() => enforceVideoRate(event.target), 0);
      setTimeout(() => enforceVideoRate(event.target), 220);
    }
  }

  function installObservers() {
    const observer = new MutationObserver((mutations) => {
      const mayContainVideo = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) =>
            node instanceof HTMLVideoElement ||
            (node instanceof Element && node.querySelector?.("video"))
        )
      );

      if (mayContainVideo) scheduleReapply();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("loadedmetadata", onVideoLifecycleEvent, true);
    document.addEventListener("canplay", onVideoLifecycleEvent, true);
    document.addEventListener("playing", onVideoLifecycleEvent, true);
    document.addEventListener("yt-navigate-finish", scheduleReapply);
    document.addEventListener("yt-page-data-updated", scheduleReapply);

    // Lightweight safety net for YouTube player updates that do not replace the
    // video element or emit one of the navigation lifecycle events above.
    setInterval(() => applySpeed(settings.speed), WATCHDOG_INTERVAL);
  }

  function installMessageHandler() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return undefined;

      const respond = async () => {
        switch (message.type) {
          case "PING":
          case "GET_STATE":
            applySpeed(settings.speed);
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
      console.debug("[YT Speed Enhancer] Could not load settings; using defaults.", error);
      settings = { ...DEFAULTS };
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[STORAGE_KEY]?.newValue) return;

    const next = changes[STORAGE_KEY].newValue;
    settings = {
      speed: clampSpeed(next.speed ?? settings.speed),
      step: clampStep(next.step ?? settings.step),
      showToast: next.showToast !== false
    };
    applySpeed(settings.speed);
    scheduleReapply();
  });

  async function start() {
    if (started) return;
    started = true;
    await loadSettings();
    installMessageHandler();
    installObservers();
    document.addEventListener("keydown", onKeyDown, true);
    scheduleReapply();
    console.info("[YT Speed Enhancer] v2.0.1 ready", getState());
  }

  void start();
})();
