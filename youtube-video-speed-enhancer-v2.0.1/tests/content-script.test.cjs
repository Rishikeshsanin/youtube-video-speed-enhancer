const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor() {
    this.children = [];
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(type) {
    for (const handler of this.listeners.get(type) || []) handler({ target: this });
  }

  closest() {
    return null;
  }

  querySelector(selector) {
    if (selector === "video") {
      return this.children.find((child) => child instanceof FakeVideo) || null;
    }
    return null;
  }
}

class FakeVideo extends FakeElement {
  constructor() {
    super();
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
  }
}

class FakeEditable extends FakeElement {
  closest() {
    return this;
  }
}

const videoA = new FakeVideo();
const videos = [videoA];
const documentListeners = new Map();
let messageHandler;
let storageChangeHandler;
let mutationCallback;
let storedSettings = { speed: 1.5, step: 0.25, showToast: false };

Object.assign(globalThis, {
  Element: FakeElement,
  HTMLVideoElement: FakeVideo,
  location: { href: "https://www.youtube.com/watch?v=test" },
  requestAnimationFrame: (callback) => callback(),
  setTimeout: (callback) => {
    callback();
    return 1;
  },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  document: {
    documentElement: new FakeElement(),
    querySelectorAll: (selector) => (selector === "video" ? videos : []),
    getElementById: () => null,
    createElement: () => new FakeElement(),
    addEventListener: (type, handler) => documentListeners.set(type, handler)
  },
  MutationObserver: class {
    constructor(callback) {
      mutationCallback = callback;
    }
    observe() {}
  },
  chrome: {
    storage: {
      sync: {
        async get(defaults) {
          return {
            ...defaults,
            ytSpeedEnhancerSettings: { ...storedSettings }
          };
        },
        async set(payload) {
          storedSettings = { ...payload.ytSpeedEnhancerSettings };
        }
      },
      onChanged: {
        addListener(handler) {
          storageChangeHandler = handler;
        }
      }
    },
    runtime: {
      onMessage: {
        addListener(handler) {
          messageHandler = handler;
        }
      }
    }
  }
});

function send(message) {
  return new Promise((resolve, reject) => {
    try {
      const keepAlive = messageHandler(message, {}, resolve);
      if (keepAlive !== true) reject(new Error("Message handler did not keep the response channel open"));
    } catch (error) {
      reject(error);
    }
  });
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "youtube_speed_change.js"), "utf8");
  vm.runInThisContext(source, { filename: "youtube_speed_change.js" });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(typeof messageHandler, "function", "content script should install a message handler");
  assert.equal(typeof mutationCallback, "function", "content script should observe YouTube DOM changes");
  assert.equal(typeof storageChangeHandler, "function", "content script should observe stored setting changes");
  assert.equal(videoA.playbackRate, 1.5, "saved playback speed should be applied on startup");

  let response = await send({ type: "GET_STATE" });
  assert.equal(response.ok, true);
  assert.equal(response.state.speed, 1.5);
  assert.equal(response.state.videoCount, 1);

  response = await send({ type: "SET_SPEED", speed: 3.25 });
  assert.equal(response.state.speed, 3.25);
  assert.equal(videoA.playbackRate, 3.25);
  assert.equal(storedSettings.speed, 3.25);

  response = await send({ type: "SET_SPEED", speed: 999 });
  assert.equal(response.state.speed, 10, "speed should clamp to the 10x maximum");

  response = await send({ type: "SET_SPEED", speed: 0 });
  assert.equal(response.state.speed, 0.25, "speed should clamp to the 0.25x minimum");

  await send({ type: "SET_STEP", step: 0.5 });
  response = await send({ type: "NUDGE_SPEED", direction: 1 });
  assert.equal(response.state.speed, 0.75, "nudge should use the configured step");

  response = await send({ type: "RESET_SPEED" });
  assert.equal(response.state.speed, 1);
  assert.equal(videoA.playbackRate, 1);

  const keyboardHandler = documentListeners.get("keydown");
  assert.equal(typeof keyboardHandler, "function", "keyboard shortcuts should be installed");

  const event = {
    key: "+",
    target: new FakeElement(),
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault() {},
    stopPropagation() {}
  };
  keyboardHandler(event);
  await Promise.resolve();
  assert.equal(videoA.playbackRate, 1.5, "+ should increase speed by the configured step");

  // Simulate YouTube trying to force the player back to a native menu rate.
  videoA.playbackRate = 2;
  videoA.dispatchEvent("ratechange");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(videoA.playbackRate, 1.5, "rate guard should recover from a YouTube playback-rate reset");

  const editingEvent = {
    ...event,
    target: new FakeEditable()
  };
  keyboardHandler(editingEvent);
  await Promise.resolve();
  assert.equal(videoA.playbackRate, 1.5, "shortcuts should be ignored while typing");

  const videoB = new FakeVideo();
  videos.push(videoB);
  mutationCallback([{ addedNodes: [videoB] }]);
  assert.equal(videoB.playbackRate, 1.5, "replacement YouTube video elements should inherit the selected speed");

  storageChangeHandler(
    {
      ytSpeedEnhancerSettings: {
        newValue: { speed: 2, step: 0.1, showToast: false }
      }
    },
    "sync"
  );
  assert.equal(videoA.playbackRate, 2, "storage changes should sync back into the active player");
  assert.equal(videoB.playbackRate, 2);

  console.log("content-script behavior: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
