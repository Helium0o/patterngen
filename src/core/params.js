// Parameter schema + validation. Every pattern declares a schema; user input is coerced and
// clamped against it so bad input can NEVER crash a render or produce NaNs. Unknown keys are
// ignored. This is the main "stability" guarantee of the library.
//
// Schema entry shapes (all entries may also carry: label, help, advanced: true):
//   { type: 'int',    default, min, max, step: 1 }
//   { type: 'float',  default, min, max, step }
//   { type: 'bool',   default }
//   { type: 'enum',   default, options: [...] }
//   { type: 'color',  default: '#rrggbb' }                 // also '#rrggbbaa', 'transparent', rgb(), hsl()
//   { type: 'colors', default: ['#..', ...], minItems, maxItems }   // array OR "a, b, c" string
//   { type: 'string', default, maxLength }
//   { type: 'seed',   default }                            // int32; strings are hashed
//
// `advanced: true` marks knobs a simple UI can hide behind a "More" toggle.

import { normColor } from './color.js';
import { seedFromString } from './hash.js';

export function resolveParams(schema, input = {}) {
  const out = {};
  for (const key of Object.keys(schema)) {
    const s = schema[key];
    const v = input == null || typeof input !== 'object' ? undefined : input[key];
    out[key] = coerce(s, v);
  }
  return out;
}

const toNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

function coerce(s, v) {
  switch (s.type) {
    case 'int': {
      let n = toNum(v);
      if (!Number.isFinite(n)) n = s.default;
      n = Math.round(n);
      return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n));
    }
    case 'float': {
      let n = toNum(v);
      if (!Number.isFinite(n)) n = s.default;
      return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n));
    }
    case 'seed': {
      if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v)) ? Number(v) | 0 : seedFromString(v);
      if (typeof v === 'number' && Number.isFinite(v)) return v | 0;
      return s.default | 0;
    }
    case 'bool':
      if (typeof v === 'boolean') return v;
      if (v === 'true' || v === 1 || v === '1') return true;
      if (v === 'false' || v === 0 || v === '0') return false;
      return !!s.default;
    case 'enum': {
      // accept '8' for 8 and vice versa (URL params, form inputs)
      const hit = s.options.find((o) => o === v || (v != null && typeof v !== 'object' && String(o) === String(v)));
      return hit === undefined ? s.default : hit;
    }
    case 'color':
      return normColor(v) ?? s.default;
    case 'colors': {
      const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]\s*|\s+(?=#)/) : null;
      if (!arr) return s.default.slice();
      const ok = arr.map(normColor).filter(Boolean);
      const min = s.minItems ?? 1, max = s.maxItems ?? 16;
      return ok.length >= min ? ok.slice(0, max) : s.default.slice();
    }
    case 'string': {
      if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
      if (typeof v !== 'string') return s.default;
      return v.slice(0, s.maxLength ?? 4000);
    }
    default:
      return v === undefined ? s.default : v;
  }
}

/** Convenience builders so pattern files stay short and uniform. */
export const P = {
  int: (def, min, max, label, help) => ({ type: 'int', default: def, min, max, step: 1, label, help }),
  float: (def, min, max, label, help, step) => ({ type: 'float', default: def, min, max, step: step ?? niceStep(min, max), label, help }),
  bool: (def, label, help) => ({ type: 'bool', default: def, label, help }),
  enumOf: (def, options, label, help) => ({ type: 'enum', default: def, options, label, help }),
  color: (def, label, help) => ({ type: 'color', default: def, label, help }),
  colors: (def, label, help, minItems = 1, maxItems = 16) => ({ type: 'colors', default: def, label, help, minItems, maxItems }),
  string: (def, label, help, maxLength = 4000) => ({ type: 'string', default: def, label, help, maxLength }),
  seed: (def = 1) => ({ type: 'seed', default: def, label: 'Seed', help: 'Same seed + params = identical output, always. Change it for a different random variation.' }),
};

/** Mark a schema entry as advanced (hidden by simple UIs). */
export const adv = (entry) => ({ ...entry, advanced: true });

function niceStep(min, max) {
  const r = Math.abs(max - min);
  if (!(r > 0)) return 0.01;
  const raw = r / 200;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return +(raw >= 5 * p ? 5 * p : raw >= 2 * p ? 2 * p : p).toPrecision(1);
}
