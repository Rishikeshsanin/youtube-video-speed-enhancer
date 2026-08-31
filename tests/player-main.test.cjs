const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(event) {
    const evt = typeof event === "string" ? { type: event, target: this } : event;
    if (!evt.target) evt.target = this;
    for (const handler of this.listeners.get(evt.type) || []) handler(evt);
    return true;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName = "DIV") {
    super();
    this.tagName = tagName;
    this.attrs = new Map();
    this.isConnected = true;
    this.children = [];
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  removeAttribute(name) {
    this.attrs.delete(name);
  }

  querySelector(selector) {
    if (selector === "video") return this.children.find((child) => child.tagName === "VIDEO") || null;
    return null;
  }

  closest() {
    return this.tagName === "VIDEO" ? this : null;
  }
}

class FakeMediaElement extends FakeElement {
  constructor(tagName = "MEDIA") {
    super(tagName);
    this._playbackRate = 1;
    this._defaultPlaybackRate = 1;
    this.paused = false;
    this.readyState = 4;
    this.currentSrc = "https://example.test/video";
  }

  getBoundingClientRect() {
    return { width: 1280, height: 720 };
  }
}

Object.defineProperty(FakeMediaElement.prototype, "playbackRate", {
  configurable: true,
  enumerable: true,
  get() {
    return this._playbackRate;
  },
  set(value) {
    this._playbackRate = Number(value);
  }
});

Object.defineProperty(FakeMediaElement.prototype, "defaultPlaybackRate", {
  configurable: true,
  enumerable: true,
  get() {
    return this._defaultPlaybackRate;
  },
  set(value) {
    this._defaultPlaybackRate = Number(value);
  }
});

const nativePlaybackSetter = Object.getOwnPropertyDescriptor(
  FakeMediaElement.prototype,
  "playbackRate"
).set;

class FakeVideo extends FakeMediaElement {
  constructor() {
    super("VIDEO");
    this.src = "";
    this.classList = {
      contains(name) {
        return name === "html5-main-video";
      }
    };
  }
}

const root = new FakeElement("HTML");
const documentTarget = new FakeEventTarget();
const videoA = new FakeVideo();
const videos = [videoA];
let mutationCallback = null;
const playerCalls = [];

const player = {
  getAvailablePlaybackRates() {
    return [0.25, 0.5, 1, 1.5, 2, 3, 4];
  },
  setPlaybackRate(rate) {
    playerCalls.push(rate);
    videoA.playbackRate = rate;
  }
};

Object.assign(globalThis, {
  HTMLMediaElement: FakeMediaElement,
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
  location: { href: "https://www.youtube.com/watch?v=test" },
  queueMicrotask: (callback) => callback(),
  setTimeout: (callback) => {
    callback();
    return Math.random();
  },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  document: {
    documentElement: root,
    visibilityState: "visible",
    querySelectorAll(selector) {
      return selector === "video" ? videos : [];
    },
    getElementById(id) {
      return id === "movie_player" ? player : null;
    },
    addEventListener(type, handler) {
      documentTarget.addEventListener(type, handler);
    }
  },
  MutationObserver: class {
    constructor(callback) {
      mutationCallback = callback;
    }
    observe() {}
  }
});

function sendCommand(type, payload = {}) {
  root.setAttribute(
    "data-ytse-command",
    JSON.stringify({ id: Date.now(), type, ...payload })
  );
  root.dispatchEvent({ type: "ytse:v3:command", target: root });
  root.removeAttribute("data-ytse-command");
}

function state() {
  return JSON.parse(root.getAttribute("data-ytse-state"));
}

(() => {
  const source = fs.readFileSync(path.join(__dirname, "..", "player-main.js"), "utf8");
  vm.runInThisContext(source, { filename: "player-main.js" });

  assert.equal(state().ready, true, "main-world engine should publish readiness");
  assert.equal(state().prototypeGuard, true, "native playback setter guard should install");
  assert.equal(typeof mutationCallback, "function", "player engine should observe YouTube DOM changes");

  sendCommand("CONFIGURE", { speed: 8 });
  assert.equal(videoA.playbackRate, 8, "custom speed should be applied through the native descriptor");
  assert.equal(state().actualSpeed, 8);
  assert.equal(state().hardLock, true, "non-native YouTube rates should enable the hard reset guard");
  assert.equal(playerCalls.includes(8), false, "unsupported custom speed must not be sent to YouTube's rate table API");

  // Simulate YouTube JavaScript trying to force a native rate after our custom 8x write.
  videoA.playbackRate = 2;
  assert.equal(videoA.playbackRate, 8, "MAIN-world setter guard should block a YouTube reset");
  sendCommand("GET_STATE");
  assert.ok(state().interceptedResets >= 1, "blocked resets should be surfaced in diagnostics");

  // Native rates should still be synchronized through YouTube's own player API.
  sendCommand("CONFIGURE", { speed: 2 });
  assert.equal(videoA.playbackRate, 2);
  assert.equal(playerCalls.at(-1), 2, "native rates should keep YouTube's internal player state in sync");
  assert.equal(state().hardLock, false);

  // Even if a browser/player path bypasses the JS wrapper, ratechange recovery should reapply.
  sendCommand("CONFIGURE", { speed: 8 });
  nativePlaybackSetter.call(videoA, 4);
  assert.equal(videoA.playbackRate, 4, "test should bypass the patched setter before recovery");
  videoA.dispatchEvent({ type: "ratechange", target: videoA });
  assert.equal(videoA.playbackRate, 8, "ratechange recovery should handle native/internal resets");

  const videoB = new FakeVideo();
  videos.push(videoB);
  mutationCallback([{ addedNodes: [videoB] }]);
  assert.equal(videoB.playbackRate, 8, "replacement YouTube video elements should inherit the target rate");

  sendCommand("CONFIGURE", { speed: 999 });
  assert.equal(videoA.playbackRate, 16, "speed should clamp to Chromium's chosen 16x product maximum");
  assert.equal(state().requestedSpeed, 16);

  console.log("main-world player engine: ok");
})();
