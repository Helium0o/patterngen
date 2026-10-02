// Parameter schema + validation. Every pattern declares a schema; user input is coerced and
// clamped against it so bad input can NEVER crash a render or produce NaNs. Unknown keys are
// ignored. This is the main "stability" guarantee of the library.
//
// Schema entry shapes:
//   { type: 'int',   default, min, max, step?, label?, help? }
//   { type: 'float', default, min, max, step?, ... }
//   { type: 'bool',  default }
//   { type: 'enum',  default, options: [...] }
//   { type: 'color', default: '#rrggbb' }
//   { type: 'colors',default: ['#..', ...], minItems?, maxItems? }
//   { type: 'string',default, maxLength? }
//   { type: 'seed',  default }            // int32, any value accepted

import { isHex } from './color.js';
import { seedFromString } from './hash.js';

export function resolveParams(schema, input = {}) {
  const out = {};
  for (const key of Object.keys(schema)) {
    const s = schema[key];
    const v = input == null ? undefined : input[key];
    out[key] = coerce(s, v);
  }
  return out;
}

function coerce(s, v) {
  switch (s.type) {
    case 'int': {
      let n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n)) n = s.default;
      n = Math.round(n);
      return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n));
    }
    case 'float': {
      let n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n)) n = s.default;
      return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n));
    }
    case 'seed': {
      if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v)) ? Number(v) | 0 : seedFromString(v);
      if (typeof v === 'number' && Number.isFinite(v)) return v | 0;
      return s.default | 0;
    }
    case 'bool':
      return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : !!s.default;
    case 'enum': {
      // accept '8' for 8 and vice versa (URL params, form inputs)
      const hit = s.options.find((o) => o === v || (v != null && typeof v !== 'object' && String(o) === String(v)));
      return hit === undefined ? s.default : hit;
    }
    case 'color':
      return isHex(v) ? normHex(v) : s.default;
    case 'colors': {
      if (!Array.isArray(v)) return s.default.slice();
      const ok = v.filter(isHex).map(normHex);
      const min = s.minItems ?? 1, max = s.maxItems ?? 16;
      return ok.length >= min ? ok.slice(0, max) : s.default.slice();
    }
    case 'string': {
      if (typeof v !== 'string') return s.default;
      return v.slice(0, s.maxLength ?? 4000);
    }
    default:
      return v === undefined ? s.default : v;
  }
}

function normHex(h) {
  h = h.trim();
  return h[0] === '#' ? h.toLowerCase() : '#' + h.toLowerCase();
}

/** Convenience builders so pattern files stay short and uniform. */
export const P = {
  int: (def, min, max, label, help) => ({ type: 'int', default: def, min, max, label, help }),
  float: (def, min, max, label, help) => ({ type: 'float', default: def, min, max, label, help }),
  bool: (def, label, help) => ({ type: 'bool', default: def, label, help }),
  enumOf: (def, options, label, help) => ({ type: 'enum', default: def, options, label, help }),
  color: (def, label, help) => ({ type: 'color', default: def, label, help }),
  colors: (def, label, help, minItems = 1, maxItems = 16) => ({ type: 'colors', default: def, label, help, minItems, maxItems }),
  string: (def, label, help, maxLength = 4000) => ({ type: 'string', default: def, label, help, maxLength }),
  seed: (def = 1) => ({ type: 'seed', default: def, label: 'Seed', help: 'Same seed + params = identical output, always.' }),
};
