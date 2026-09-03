import * as crypto from 'node:crypto';

export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj as Readonly<T>;
  }

  // Handle Array / TypedArray / Object
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj) as Readonly<T>;
}

export function deepCloneAndFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj as Readonly<T>;
  }
  const cloned = JSON.parse(JSON.stringify(obj));
  return deepFreeze(cloned);
}

export function assertImmutable(obj: unknown, label = 'Object'): void {
  if (obj === null || typeof obj !== 'object') {
    return;
  }
  if (!Object.isFrozen(obj)) {
    throw new Error(`[MUTATION_ATTEMPTED] ${label} is not frozen.`);
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === 'object') {
      assertImmutable(val, `${label}.${key}`);
    }
  }
}

/**
 * Deterministically serializes any JavaScript value into canonical JSON with recursively sorted object keys.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((obj as Record<string, unknown>)[key])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Calculates deterministic SHA-256 fingerprint for simulation inputs using canonical serialization.
 */
export function computeInputFingerprint(input: unknown): string {
  const canonical = canonicalJson(input);
  return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
}
