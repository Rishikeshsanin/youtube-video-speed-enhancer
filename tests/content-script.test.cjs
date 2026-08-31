const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor() {
    this.attrs = new Map();
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

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  removeAttribute(name) {
    this.attrs.delete(name);
  }

  closest() {
    return null;
  }
}

class FakeEditable extends FakeElement {
  closest() {
    return this;
  }
}

const root = new FakeElement();
const documentListeners = new Map();
let messageHandler;
let storageChangeHandler;
let storedSettings = { speed: 1.5, step: 0.25, showToast: false };
let engineState = {
  engineVersion: 3,
  ready: true,
  configured: false,
  requestedSpeed: 1,
  actualSpeed: null,
  effectiveMatch: null,
  videoCount: 1,
  hardLock: false,
  prototypeGuard: true,
  playerApiAvailable: true,
  playerApiSynced: true,
  playerNativeRate: true,
  interceptedResets: 0
};

function publishEngineState(reason = "test") {
  root.setAttribute("data-ytse-state", JSON.stringify({ ...engineState, reason }));
  root.dispatchEvent({ type: "ytse:v3:state", target: root });
}

root.addEventListener("ytse:v3:command", () => {
  const command = JSON.parse(root.getAttribute("data-ytse-command"));
  if (command.type === "CONFIGURE" || command.type === "SET_SPEED") {
    const speed = Math.max(0.25, Math.min(16, Number(command.speed)));
    engineState = {
      ...engineState,
      configured: true,
      requestedSpeed: speed,
      actualSpeed: speed,
      effectiveMatch: true,
      hardLock: ![0.25, 0.5, 1, 1.5, 2, 3, 4].includes(speed),
      playerApiSynced: [0.25, 0.5, 1, 1.5, 2, 3, 4].includes(speed),
      playerNativeRate: [0.25, 0.5, 1, 1.5, 2, 3, 4].includes(speed)
    };
  }
  publishEngineState(command.type.toLowerCase());
});

Object.assign(globalThis, {
  Element: FakeElement,
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
  location: { href: "https://www.youtube.com/watch?v=test" },
  requestAnimationFrame: (callback) => callback(),
  setTimeout: (callback) => {
    callback();
    return 1;
  },
  clearTimeout: () => {},
  document: {
    documentElement: root,
    getElementById: () => null,
    createElement: () => new FakeElement(),
    addEventListener(type, handler) {
      documentListeners.set(type, handler);
    }
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
  publishEngineState("boot");
  const source = fs.readFileSync(path.join(__dirname, "..", "youtube_speed_change.js"), "utf8");
  vm.runInThisContext(source, { filename: "youtube_speed_change.js" });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(typeof messageHandler, "function", "isolated bridge should install a popup message handler");
  assert.equal(typeof storageChangeHandler, "function", "isolated bridge should observe sync settings");
  assert.equal(engineState.requestedSpeed, 1.5, "saved speed should configure the main-world engine at startup");

  let response = await send({ type: "GET_STATE" });
  assert.equal(response.ok, true);
  assert.equal(response.state.speed, 1.5);
  assert.equal(response.state.actualSpeed, 1.5);
  assert.equal(response.state.engineReady, true);

  response = await send({ type: "SET_SPEED", speed: 8 });
  assert.equal(response.state.speed, 8);
  assert.equal(response.state.actualSpeed, 8);
  assert.equal(response.state.hardLock, true, "custom high speeds should report reset guard mode");
  assert.equal(storedSettings.speed, 8, "selected speed should persist");

  response = await send({ type: "SET_SPEED", speed: 999 });
  assert.equal(response.state.speed, 16, "bridge should clamp to the product maximum");
  assert.equal(engineState.actualSpeed, 16);

  await send({ type: "SET_SPEED", speed: 1 });
  await send({ type: "SET_STEP", step: 0.5 });
  response = await send({ type: "NUDGE_SPEED", direction: 1 });
  assert.equal(response.state.speed, 1.5, "nudge should use the configured keyboard step");

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
  await Promise.resolve();
  assert.equal(engineState.actualSpeed, 2, "+ should increase speed through the main-world bridge");

  const editingEvent = { ...event, target: new FakeEditable() };
  keyboardHandler(editingEvent);
  await Promise.resolve();
  assert.equal(engineState.actualSpeed, 2, "shortcuts should be ignored while typing");

  const resetEvent = { ...event, key: "\\" };
  keyboardHandler(resetEvent);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(engineState.actualSpeed, 1, "backslash should reset playback to 1x");

  storageChangeHandler(
    {
      ytSpeedEnhancerSettings: {
        newValue: { speed: 3, step: 0.1, showToast: false }
      }
    },
    "sync"
  );
  assert.equal(engineState.actualSpeed, 3, "storage changes should reconfigure the active player engine");

  console.log("isolated bridge behavior: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
