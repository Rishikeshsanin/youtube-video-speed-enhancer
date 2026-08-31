(() => {
  "use strict";

  if (globalThis.__YTSE_MAIN_V3__) return;
  globalThis.__YTSE_MAIN_V3__ = true;

  const MIN_SPEED = 0.25;
  const MAX_SPEED = 16;
  const COMMAND_EVENT = "ytse:v3:command";
  const STATE_EVENT = "ytse:v3:state";
  const COMMAND_ATTR = "data-ytse-command";
  const STATE_ATTR = "data-ytse-state";
  const RETRY_DELAYS = [0, 24, 80, 180, 420, 900, 1600];
  const WATCHDOG_INTERVAL = 650;
  const FALLBACK_NATIVE_RATES = new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4]);

  let configured = false;
  let targetSpeed = 1;
  let commandId = 0;
  let prototypeGuardInstalled = false;
  let interceptedResets = 0;
  let lastInterceptedRate = null;
  let supportedRates = [];
  let lastReason = "boot";
  let reapplyTimers = [];
  let lastPlayerApiSync = false;
  const observedVideos = new WeakSet();

  const mediaProto = globalThis.HTMLMediaElement?.prototype;
  const playbackDescriptor = mediaProto
    ? Object.getOwnPropertyDescriptor(mediaProto, "playbackRate")
    : null;
  const defaultPlaybackDescriptor = mediaProto
    ? Object.getOwnPropertyDescriptor(mediaProto, "defaultPlaybackRate")
    : null;

  const round = (value, places = 2) => {
    const factor = 10 ** places;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };

  const clampSpeed = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return targetSpeed;
    return round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, parsed)));
  };

  const sameRate = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

  const getRoot = () => document.documentElement;

  function isYouTubeVideo(video) {
    if (!video || video.tagName !== "VIDEO") return false;
    if (video.classList?.contains("html5-main-video")) return true;

    try {
      return Boolean(
        video.closest?.("#movie_player, ytd-player, ytd-reel-video-renderer, #shorts-player")
      );
    } catch (_error) {
      return false;
    }
  }

  function getVideos() {
    const all = Array.from(document.querySelectorAll("video"));
    const managed = all.filter(isYouTubeVideo);
    if (managed.length) return managed;
    return all.length === 1 ? all : [];
  }

  function scoreVideo(video) {
    if (!video?.isConnected) return -Infinity;

    let score = 0;
    if (video.classList?.contains("html5-main-video")) score += 1000;
    if (!video.paused) score += 250;
    if (Number(video.readyState) >= 2) score += 120;
    if (video.currentSrc || video.src) score += 40;

    try {
      const rect = video.getBoundingClientRect?.();
      if (rect) score += Math.min(400, Math.max(0, rect.width * rect.height) / 2500);
    } catch (_error) {
      // Ignore layout access failures in unusual embedded player states.
    }

    return score;
  }

  function getPrimaryVideo() {
    return getVideos().sort((a, b) => scoreVideo(b) - scoreVideo(a))[0] || null;
  }

  function getPlayer() {
    const player = document.getElementById("movie_player");
    return player && typeof player === "object" ? player : null;
  }

  function refreshSupportedRates() {
    const player = getPlayer();
    if (!player || typeof player.getAvailablePlaybackRates !== "function") {
      return supportedRates;
    }

    try {
      const next = player
        .getAvailablePlaybackRates()
        ?.map(Number)
        .filter((rate) => Number.isFinite(rate));
      if (Array.isArray(next) && next.length) {
        supportedRates = Array.from(new Set(next.map((rate) => round(rate)))).sort((a, b) => a - b);
      }
    } catch (_error) {
      // Player APIs are intentionally best-effort because YouTube changes them independently.
    }

    return supportedRates;
  }

  function isPlayerNativeRate(rate = targetSpeed) {
    const available = refreshSupportedRates();
    if (available.length) return available.some((candidate) => sameRate(candidate, rate));
    return FALLBACK_NATIVE_RATES.has(round(rate));
  }

  function shouldHardLock(video) {
    return configured && isYouTubeVideo(video) && !isPlayerNativeRate(targetSpeed);
  }

  function setWithNativeDescriptor(video, speed) {
    if (!video) return false;
    const safeSpeed = clampSpeed(speed);

    try {
      if (defaultPlaybackDescriptor?.set && !sameRate(video.defaultPlaybackRate, safeSpeed)) {
        defaultPlaybackDescriptor.set.call(video, safeSpeed);
      } else if (!defaultPlaybackDescriptor?.set) {
        video.defaultPlaybackRate = safeSpeed;
      }

      if (playbackDescriptor?.set && !sameRate(video.playbackRate, safeSpeed)) {
        playbackDescriptor.set.call(video, safeSpeed);
      } else if (!playbackDescriptor?.set) {
        video.playbackRate = safeSpeed;
      }

      return sameRate(video.playbackRate, safeSpeed);
    } catch (error) {
      console.debug("[YTSE main] Native playback write failed", error);
      return false;
    }
  }

  function syncYouTubePlayerApi(speed) {
    const player = getPlayer();
    lastPlayerApiSync = false;
    if (!player || typeof player.setPlaybackRate !== "function") return false;

    const available = refreshSupportedRates();
    if (!available.some((candidate) => sameRate(candidate, speed))) return false;

    try {
      player.setPlaybackRate(speed);
      lastPlayerApiSync = true;
      return true;
    } catch (_error) {
      return false;
    }
  }

  function attachVideo(video) {
    if (!video || observedVideos.has(video)) return;
    observedVideos.add(video);

    const ensureTarget = () => {
      if (!configured) return;
      if (!sameRate(video.playbackRate, targetSpeed)) {
        scheduleApply("media-ratechange", [0, 18, 90, 240]);
      }
    };

    video.addEventListener("ratechange", ensureTarget, true);
    video.addEventListener("loadedmetadata", () => scheduleApply("loadedmetadata"), true);
    video.addEventListener("canplay", () => scheduleApply("canplay", [0, 100, 400]), true);
    video.addEventListener("playing", () => scheduleApply("playing", [0, 60, 240]), true);
    video.addEventListener("emptied", () => scheduleApply("emptied"), true);
  }

  function getActualSpeed() {
    const video = getPrimaryVideo();
    return video ? round(video.playbackRate) : null;
  }

  function getEngineState(reason = lastReason) {
    const videos = getVideos();
    const primary = getPrimaryVideo();
    const actualSpeed = primary ? round(primary.playbackRate) : null;
    const nativeRate = isPlayerNativeRate(targetSpeed);

    return {
      engineVersion: 3,
      ready: true,
      configured,
      requestedSpeed: round(targetSpeed),
      actualSpeed,
      effectiveMatch: actualSpeed == null ? null : sameRate(actualSpeed, targetSpeed),
      videoCount: videos.length,
      playerApiAvailable: Boolean(getPlayer()?.setPlaybackRate),
      playerApiSynced: lastPlayerApiSync,
      playerNativeRate: nativeRate,
      hardLock: Boolean(primary && shouldHardLock(primary)),
      prototypeGuard: prototypeGuardInstalled,
      supportedRates: [...supportedRates],
      interceptedResets,
      lastInterceptedRate,
      reason,
      commandId,
      url: location.href
    };
  }

  function publishState(reason = lastReason) {
    lastReason = reason;
    const root = getRoot();
    if (!root) return;

    try {
      root.setAttribute(STATE_ATTR, JSON.stringify(getEngineState(reason)));
      root.dispatchEvent(new Event(STATE_EVENT));
    } catch (_error) {
      // State publication is diagnostic only; playback should continue if it fails.
    }
  }

  function applyNow(reason = "apply") {
    if (!configured) {
      publishState(reason);
      return 0;
    }

    syncYouTubePlayerApi(targetSpeed);

    let applied = 0;
    for (const video of getVideos()) {
      attachVideo(video);
      if (setWithNativeDescriptor(video, targetSpeed)) applied += 1;
    }

    publishState(reason);
    return applied;
  }

  function scheduleApply(reason = "retry", delays = RETRY_DELAYS) {
    for (const timer of reapplyTimers) clearTimeout(timer);
    reapplyTimers = delays.map((delay) =>
      setTimeout(() => applyNow(`${reason}:${delay}`), delay)
    );
  }

  function installPrototypeGuard() {
    if (!mediaProto || !playbackDescriptor?.set || !playbackDescriptor?.get) return false;
    if (!playbackDescriptor.configurable) return false;

    try {
      Object.defineProperty(mediaProto, "playbackRate", {
        configurable: playbackDescriptor.configurable,
        enumerable: playbackDescriptor.enumerable,
        get: playbackDescriptor.get,
        set(value) {
          if (shouldHardLock(this) && !sameRate(value, targetSpeed)) {
            interceptedResets += 1;
            lastInterceptedRate = Number.isFinite(Number(value)) ? round(Number(value)) : null;
            const result = playbackDescriptor.set.call(this, targetSpeed);
            queueMicrotask(() => publishState("blocked-page-reset"));
            return result;
          }
          return playbackDescriptor.set.call(this, value);
        }
      });

      if (
        defaultPlaybackDescriptor?.set &&
        defaultPlaybackDescriptor?.get &&
        defaultPlaybackDescriptor.configurable
      ) {
        Object.defineProperty(mediaProto, "defaultPlaybackRate", {
          configurable: defaultPlaybackDescriptor.configurable,
          enumerable: defaultPlaybackDescriptor.enumerable,
          get: defaultPlaybackDescriptor.get,
          set(value) {
            if (shouldHardLock(this) && !sameRate(value, targetSpeed)) {
              return defaultPlaybackDescriptor.set.call(this, targetSpeed);
            }
            return defaultPlaybackDescriptor.set.call(this, value);
          }
        });
      }

      prototypeGuardInstalled = true;
      return true;
    } catch (error) {
      console.debug("[YTSE main] Could not install playback setter guard", error);
      return false;
    }
  }

  function readCommand() {
    const root = getRoot();
    if (!root) return null;

    const raw = root.getAttribute(COMMAND_ATTR);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function onCommand() {
    const command = readCommand();
    if (!command || typeof command.type !== "string") return;

    commandId = Number(command.id) || commandId + 1;

    if (command.type === "CONFIGURE" || command.type === "SET_SPEED") {
      targetSpeed = clampSpeed(command.speed);
      configured = true;
      applyNow("command");
      scheduleApply("command-retry");
      return;
    }

    if (command.type === "GET_STATE") {
      publishState("state-request");
    }
  }

  function installLifecycleHooks() {
    const observer = new MutationObserver((mutations) => {
      const hasMediaCandidate = mutations.some((mutation) =>
        Array.from(mutation.addedNodes || []).some((node) => {
          if (node?.tagName === "VIDEO") return true;
          return Boolean(node?.querySelector?.("video"));
        })
      );

      if (hasMediaCandidate) scheduleApply("video-added");
    });

    const root = getRoot();
    if (root) observer.observe(root, { childList: true, subtree: true });

    document.addEventListener("yt-navigate-start", () => scheduleApply("yt-navigate-start"), true);
    document.addEventListener("yt-navigate-finish", () => scheduleApply("yt-navigate-finish"), true);
    document.addEventListener("yt-page-data-updated", () => scheduleApply("yt-page-data-updated"), true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleApply("visible", [0, 80, 300]);
    });

    setInterval(() => {
      if (!configured || document.visibilityState === "hidden") return;
      const actual = getActualSpeed();
      if (actual == null || !sameRate(actual, targetSpeed)) {
        applyNow("watchdog-recover");
      }
    }, WATCHDOG_INTERVAL);
  }

  function start() {
    installPrototypeGuard();

    const root = getRoot();
    if (root) root.addEventListener(COMMAND_EVENT, onCommand);

    installLifecycleHooks();
    publishState("ready");
    console.info("[YTSE main] v3 player engine ready");
  }

  start();
})();
