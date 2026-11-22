// Tower's unified synchronous ESM + CJS assertion-identity guard for Node 22.15+ / 24+ (`docs/07` §7.6).
//
// Loaded via `NODE_OPTIONS="--import <path>/assert_guard_esm.mjs"` before any
// project code executes (with `assert_guard.cjs` via `--require` as fallback on
// older Node without `module.registerHooks`).
//
// Uses synchronous `module.registerHooks()` on the main thread (zero worker
// thread overhead, zero async ESM import race) to:
// 1. Synchronously lock `node:assert` and `node:assert/strict` (both CJS and ESM);
// 2. Watch runner globals on `globalThis` (`expect`, `assert`, `it`, `test`, `describe`, `suite`, `chai`);
// 3. Synchronously intercept both ESM `import` and CJS `require` of `node:assert`,
//    `assert`, `vitest`, `chai`, `@jest/globals`, `@jest/expect`, `expect` —
//    verifying module resolution identity and locking exported assertion functions
//    and matcher objects BEFORE user code runs;
// 4. Harden `process` exit listeners against `removeAllListeners('exit')`,
//    `removeListener`/`off`, and `reallyExit`, with a `beforeExit` safeguard.

import fs from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import moduleApi, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assertDefault from 'node:assert';
import * as assertNs from 'node:assert';
import assertStrictDefault from 'node:assert/strict';
import * as assertStrictNs from 'node:assert/strict';

const toString = Function.prototype.toString;
const defineProperty = Object.defineProperty;
const getDescriptor = Object.getOwnPropertyDescriptor;
const getNames = Object.getOwnPropertyNames;
const apply = Reflect.apply;

const LOG = process.env.TOWER_GUARD_LOG;
const write = (line) => {
  try {
    if (LOG) fs.appendFileSync(LOG, line);
  } catch {
    // No transcript outside verification: stay quiet.
  }
};

const nonce = randomBytes(16).toString('hex');
const commitment = createHash('sha256').update(nonce).digest('hex');

const hashOf = (fn) => {
  try {
    return createHash('sha256').update(toString.call(fn)).digest('hex');
  } catch {
    return 'unreadable';
  }
};

const SKIP = new Set(['CallTracker', 'strict', 'caller', 'callee', 'arguments', 'prototype', 'constructor', 'default']);
const BUILTIN_ASSERTS = new Set(['assert', 'node:assert', 'assert/strict', 'node:assert/strict']);
const THIRD_PARTY_ASSERTS = new Set(['vitest', 'chai', '@jest/globals', '@jest/expect', 'expect']);

const entries = [];
const watchedHolders = new WeakSet();
const resolvedByPkg = new Map();
const hookTampered = [];
const loadedThirdParty = new Map();
let listenerTampered = false;

function watch(label, holder, key, original) {
  const entry = { label: `${label}.${key}`, holder, key, original, assigned: false, current: original, armed: false };
  let descriptor;
  try {
    descriptor = getDescriptor(holder, key);
  } catch {
    descriptor = undefined;
  }
  if (descriptor && descriptor.configurable && (descriptor.writable || descriptor.set)) {
    const setter = function (value) {
      entry.assigned = true;
      entry.current = value;
    };
    try {
      defineProperty(holder, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: () => entry.current,
        set: setter,
      });
      entry.setter = setter;
      entry.armed = true;
    } catch {
      // Non-redefinable (e.g. ESM namespace object): end-of-process check still covers it.
    }
  }
  entry.source = hashOf(original);
  entries.push(entry);
}

function watchAll(label, obj, depth = 0) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return;
  if (watchedHolders.has(obj)) return;
  watchedHolders.add(obj);
  let names;
  try {
    names = getNames(obj);
  } catch {
    return;
  }
  for (const key of names) {
    if (SKIP.has(key)) continue;
    let value;
    try {
      value = obj[key];
    } catch {
      continue;
    }
    if (typeof value === 'function') {
      watch(label, obj, key, value);
      if (depth < 1 && (key === 'expect' || key === 'assert' || key === 'Assertion')) {
        watchAll(`${label}.${key}`, value, depth + 1);
        if (value.prototype && typeof value.prototype === 'object') {
          watchAll(`${label}.${key}.prototype`, value.prototype, depth + 1);
        }
      }
    } else if (depth < 1 && value && typeof value === 'object' && (key === 'assert' || key === 'expect')) {
      watchAll(`${label}.${key}`, value, depth + 1);
    }
  }
}

// 1. Synchronously lock built-in `node:assert` and `node:assert/strict` (shared across CJS & ESM).
const guardRequire = createRequire(import.meta.url);
let assertCjs = null;
try {
  assertCjs = guardRequire('node:assert');
} catch {
  assertCjs = null;
}
watchAll('assert', assertDefault);
watchAll('assert.strict', assertStrictDefault);
const origAssertEqual = assertNs.equal;
const origAssertStrictEqual = assertStrictNs.strictEqual;

// 2. Watch runner globals installed on `globalThis` after preload.
const GLOBALS = ['expect', 'assert', 'it', 'test', 'describe', 'suite', 'chai'];
const globals = new Map();
for (const name of GLOBALS) {
  if (name in globalThis) {
    globals.set(name, { first: globalThis[name], own: true });
    continue;
  }
  const slot = { first: undefined, own: false, value: undefined };
  try {
    defineProperty(globalThis, name, {
      configurable: true,
      enumerable: false,
      get: () => slot.value,
      set: (value) => {
        if (slot.first === undefined) slot.first = value;
        slot.value = value;
      },
    });
    globals.set(name, slot);
  } catch {
    // Unwatchable global: leave untouched.
  }
}

function canonicalPackage(specifier) {
  if (BUILTIN_ASSERTS.has(specifier)) return specifier;
  for (const pkg of THIRD_PARTY_ASSERTS) {
    if (specifier === pkg || specifier.startsWith(`${pkg}/`)) return pkg;
  }
  return null;
}

let inGuardRequire = false;

function watchLoadedUrl(pkg, url) {
  if (loadedThirdParty.has(url) || inGuardRequire) return;
  if (!url.startsWith('file:')) return;
  inGuardRequire = true;
  try {
    const filePath = fileURLToPath(url);
    // Node 22.12+/24+ supports synchronous `require()` of both CJS and ESM modules.
    const mod = guardRequire(filePath);
    loadedThirdParty.set(url, { pkg, filePath, mod });
    watchAll(`pkg:${pkg}`, mod);
    if (mod && typeof mod === 'object' && mod.default && mod.default !== mod) {
      watchAll(`pkg:${pkg}.default`, mod.default);
    }
  } catch {
    // Top-level-await ESM graphs cannot be required synchronously; resolution check still protects them.
    loadedThirdParty.set(url, { pkg, filePath: null, mod: null });
  } finally {
    inGuardRequire = false;
  }
}

// 3. Synchronously intercept ESM `import` & CJS `require` via `module.registerHooks()`.
if (typeof moduleApi.registerHooks === 'function') {
  try {
    moduleApi.registerHooks({
      resolve(specifier, context, nextResolve) {
        const res = nextResolve(specifier, context);
        if (inGuardRequire) return res;
        const pkg = canonicalPackage(specifier);
        if (!pkg) return res;

        if (BUILTIN_ASSERTS.has(pkg)) {
          if (!res.url.startsWith('node:')) {
            hookTampered.push(`resolve:${pkg}->${res.url}`);
          }
          return res;
        }

        const firstUrl = resolvedByPkg.get(pkg);
        if (firstUrl === undefined) {
          resolvedByPkg.set(pkg, res.url);
        } else if (firstUrl !== res.url) {
          hookTampered.push(`resolve:${pkg}`);
        }
        // Synchronously load and lock exported assertion entry points BEFORE user code executes.
        watchLoadedUrl(pkg, res.url);
        return res;
      },
    });
  } catch {
    // Older/restricted Node runtime: built-in & global checks still run.
  }
}

function findings() {
  const bad = [...hookTampered];
  if (listenerTampered) bad.push('guard.exit_listener');
  if (assertNs.equal !== origAssertEqual) bad.push('assert.equal');
  if (assertStrictNs.strictEqual !== origAssertStrictEqual) bad.push('assert.strict.strictEqual');
  for (const entry of entries) {
    if (entry.assigned) {
      bad.push(entry.label);
      continue;
    }
    if (entry.armed) {
      let descriptor;
      try {
        descriptor = getDescriptor(entry.holder, entry.key);
      } catch {
        descriptor = undefined;
      }
      if (!descriptor || descriptor.set !== entry.setter) {
        bad.push(entry.label);
        continue;
      }
    }
    let now;
    try {
      now = entry.holder[entry.key];
    } catch {
      bad.push(entry.label);
      continue;
    }
    if (now !== entry.original || hashOf(now) !== entry.source) bad.push(entry.label);
  }
  if (assertCjs) {
    try {
      if (guardRequire('node:assert') !== assertCjs) bad.push('assert');
    } catch {
      bad.push('assert');
    }
    if (assertDefault !== assertCjs) bad.push('assert(esm)');
  }
  for (const [name, slot] of globals) {
    const first = slot.first;
    if (first === undefined || first === null) continue;
    if (typeof first !== 'function' && typeof first !== 'object') continue;
    const now = slot.own ? globalThis[name] : slot.value;
    if (now !== first) bad.push(`global.${name}`);
  }
  for (const [, info] of loadedThirdParty) {
    if (!info.mod || !info.filePath) continue;
    inGuardRequire = true;
    try {
      if (guardRequire(info.filePath) !== info.mod) bad.push(`pkg:${info.pkg}`);
    } catch {
      bad.push(`pkg:${info.pkg}`);
    } finally {
      inGuardRequire = false;
    }
  }
  return bad;
}

let reported = false;
function report() {
  if (reported) return;
  reported = true;
  const bad = findings();
  const verdict = bad.length > 0 ? 'replaced' : 'intact';
  const detail = bad.length > 0 ? bad.slice(0, 8).join(',') : '-';
  write(`tower-assert-guard 1 node end ${nonce} ${verdict} ${detail}\n`);
}

// 4. Harden exit listeners against `removeAllListeners`, `removeListener`, `off` and `reallyExit`.
const origOn = EventEmitter.prototype.on;
const origRawListeners = EventEmitter.prototype.rawListeners;
const origRemoveAll = EventEmitter.prototype.removeAllListeners;
const origRemoveListener = EventEmitter.prototype.removeListener;
const origOff = EventEmitter.prototype.off;

function ensureAttached() {
  try {
    const exitList = apply(origRawListeners, process, ['exit']);
    if (!exitList.includes(report)) apply(origOn, process, ['exit', report]);
  } catch {
    try {
      apply(origOn, process, ['exit', report]);
    } catch {}
  }
  try {
    const beforeList = apply(origRawListeners, process, ['beforeExit']);
    if (!beforeList.includes(onBeforeExit)) apply(origOn, process, ['beforeExit', onBeforeExit]);
  } catch {
    try {
      apply(origOn, process, ['beforeExit', onBeforeExit]);
    } catch {}
  }
}

function onBeforeExit() {
  try {
    const exitList = apply(origRawListeners, process, ['exit']);
    if (!exitList.includes(report)) {
      listenerTampered = true;
      ensureAttached();
    }
  } catch {
    report();
  }
}

try {
  EventEmitter.prototype.removeAllListeners = function removeAllListeners(type) {
    const res = apply(origRemoveAll, this, arguments);
    if (this === process && (type === undefined || type === 'exit' || type === 'beforeExit')) {
      ensureAttached();
    }
    return res;
  };
  const wrapOne = (orig) =>
    function removeListener(type, listener) {
      if (
        this === process &&
        ((type === 'exit' && listener === report) || (type === 'beforeExit' && listener === onBeforeExit))
      ) {
        listenerTampered = true;
        return this;
      }
      return apply(orig, this, arguments);
    };
  EventEmitter.prototype.removeListener = wrapOne(origRemoveListener);
  EventEmitter.prototype.off = wrapOne(origOff);
} catch {}

if (typeof process.reallyExit === 'function') {
  const origReallyExit = process.reallyExit;
  try {
    process.reallyExit = function reallyExit() {
      report();
      return apply(origReallyExit, this, arguments);
    };
  } catch {}
}

write(`tower-assert-guard 1 node start ${commitment} ${entries.length}\n`);
apply(origOn, process, ['exit', report]);
apply(origOn, process, ['beforeExit', onBeforeExit]);
