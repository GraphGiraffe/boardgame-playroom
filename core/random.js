// Deterministic primitives shared by the engine; entropy is supplied by its caller.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayroomRandom = api;
})(globalThis, function () {
  'use strict';
  function entropyValue(entropy) {
    if (typeof entropy !== 'function') throw new TypeError('RANDOM_SOURCE_REQUIRED');
    return entropy();
  }

  function seedValue(value, entropy) {
    if (value == null) return (entropyValue(entropy) * 4294967296) >>> 0;
    let n = 2166136261;
    for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n >>> 0;
  }

  function random(state, entropy) {
    if (!state) return entropyValue(entropy);
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let n = state.rng;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  }

  function shuffle(items, state, entropy) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random(state, entropy) * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function rollDie(sides = 6, state, entropy) {
    if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
      throw new RangeError('DIE_SIDES_OUT_OF_RANGE');
    }
    return 1 + Math.floor(random(state, entropy) * sides);
  }

  return Object.freeze({ seedValue, random, shuffle, rollDie });
});
