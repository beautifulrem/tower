// Tower's assertion-identity guard for Node (`docs/07` §7.6).
//
// The invariant it checks: while the criteria run, the assertion entry
// points and the runners' globals the tests use must be the library's own
// objects, unmodified. Nothing about the text of the diff is involved —
// Tower loads this file before any project code (through the runner's own
// preload mechanism), records which objects the entry points are, and
// reports at the end of the process whether they still are those objects.
//
// The report goes to a transcript Tower owns, outside everything the run
// may write: the sandbox lets the run add a line to it and nothing else,
// and the file is append-only, so what Tower already has can be neither
// removed nor rewritten. Each process commits to a secret before any
// project code loads and reveals it with its verdict, so a verdict cannot
// be attributed to a process that did not report one.
'use strict';

const fs = require('node:fs');
const { createHash, randomBytes } = require('node:crypto');
const toString = Function.prototype.toString;
const defineProperty = Object.defineProperty;
const getDescriptor = Object.getOwnPropertyDescriptor;
const getNames = Object.getOwnPropertyNames;

const LOG = process.env.TOWER_GUARD_LOG;
const write = (line) => {
  try {
    if (LOG) fs.appendFileSync(LOG, line);
  } catch {
    // No transcript (this file run outside a verification): stay quiet.
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

/** Watched entry points: one per function the assertion library exports. */
const entries = [];
/** Properties that are deprecated or throw on read. */
const SKIP = new Set(['CallTracker', 'strict', 'caller', 'callee', 'arguments']);

/**
 * Watches one function-valued property: keeps the original, and replaces
 * the property with an accessor that stores whatever is assigned to it and
 * notes that an assignment happened. Reads and writes keep working, so an
 * honest run behaves exactly as before; a run that swaps the function is
 * on record even if it puts the original back before the end.
 */
function watch(label, holder, key, original) {
  const entry = { label: `${label}.${key}`, holder, key, original, assigned: false, current: original, armed: false };
  let descriptor;
  try {
    descriptor = getDescriptor(holder, key);
  } catch {
    descriptor = undefined;
  }
  if (descriptor && descriptor.configurable) {
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
      // Left as it was; the comparison at the end still covers it.
    }
  }
  entry.source = hashOf(original);
  entries.push(entry);
}

function watchAll(label, obj) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return;
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
    if (typeof value !== 'function') continue;
    watch(label, obj, key, value);
  }
}

/** The assertion module as the loader hands it out now. */
let assertModule = null;
try {
  assertModule = require('node:assert');
  watchAll('assert', assertModule);
  watchAll('assert.strict', assertModule.strict);
} catch {
  assertModule = null;
}
// Load the ES module copy now as well: later it is served from the module
// cache, so what the tests import is the object recorded here.
let assertEsm = null;
try {
  import('node:assert').then(
    (m) => {
      assertEsm = m;
    },
    () => {},
  );
} catch {
  assertEsm = null;
}

/**
 * The runners' globals. A framework installs them after this file runs, so
 * what is recorded is the first value assigned — the library's own object —
 * and the end compares against that.
 */
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
    // A global that cannot be watched is simply not reported on.
  }
}

function findings() {
  const bad = [];
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
  // The module object itself: a loader that hands the tests a different
  // one would hand this request a different one too.
  if (assertModule) {
    try {
      if (require('node:assert') !== assertModule) bad.push('assert');
    } catch {
      bad.push('assert');
    }
  }
  if (assertEsm && assertModule && assertEsm.default !== assertModule) bad.push('assert(esm)');
  for (const [name, slot] of globals) {
    const first = slot.first;
    if (first === undefined || first === null) continue;
    if (typeof first !== 'function' && typeof first !== 'object') continue;
    const now = slot.own ? globalThis[name] : slot.value;
    if (now !== first) bad.push(`global.${name}`);
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

write(`tower-assert-guard 1 node start ${commitment} ${entries.length}\n`);
process.on('exit', report);
