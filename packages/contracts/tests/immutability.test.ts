import { describe, it, expect } from 'vitest';
import { deepFreeze, assertImmutable } from '../src/index.js';

describe('Immutability and Mutation Prevention', () => {
  it('deeply freezes objects and prevents property addition or modification', () => {
    const data = {
      nested: {
        value: 42,
        arr: [1, 2, 3],
      },
    };

    const frozen = deepFreeze(data);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(Object.isFrozen(frozen.nested.arr)).toBe(true);

    expect(() => {
      (frozen.nested as unknown as Record<string, number>).value = 99;
    }).toThrow(TypeError);

    expect(() => {
      (frozen.nested.arr as unknown as number[]).push(4);
    }).toThrow(TypeError);
  });

  it('assertImmutable throws if object hierarchy is not frozen', () => {
    const mutable = { a: 1, b: { c: 2 } };
    expect(() => assertImmutable(mutable)).toThrow(/MUTATION_ATTEMPTED/);

    const frozen = deepFreeze({ a: 1, b: { c: 2 } });
    expect(() => assertImmutable(frozen)).not.toThrow();
  });
});
