import { describe, it, expect } from 'vitest';
import { createCrankAngleGrid } from '../src/index.js';
import {
  FOUR_STROKE_TDC_CONVENTION,
  TWO_STROKE_TDC_CONVENTION,
  SimulationError,
} from '@engine-analyzer/contracts';

describe('Crank Angle Grid Generation', () => {
  it('generates 4-stroke 720 deg grid with default 1 deg resolution ([0, 720))', () => {
    const grid = createCrankAngleGrid({ convention: FOUR_STROKE_TDC_CONVENTION, resolutionDeg: 1.0 });

    expect(grid.convention.cycleDegrees).toBe(720);
    expect(grid.sampleCount).toBe(720);
    expect(grid.samples[0]).toBe(0);
    expect(grid.samples[719]).toBe(719);
    expect(Object.isFrozen(grid)).toBe(true);
    expect(Object.isFrozen(grid.samples)).toBe(true);
  });

  it('generates 2-stroke 360 deg grid with 0.5 deg resolution', () => {
    const grid = createCrankAngleGrid({ convention: TWO_STROKE_TDC_CONVENTION, resolutionDeg: 0.5 });

    expect(grid.convention.cycleDegrees).toBe(360);
    expect(grid.sampleCount).toBe(720);
    expect(grid.samples[0]).toBe(0);
    expect(grid.samples[719]).toBe(359.5);
  });

  it('rejects invalid or non-positive grid resolution', () => {
    expect(() => createCrankAngleGrid({ resolutionDeg: 0 })).toThrowError(SimulationError);
    expect(() => createCrankAngleGrid({ resolutionDeg: -5 })).toThrowError(SimulationError);
    expect(() => createCrankAngleGrid({ resolutionDeg: 1000 })).toThrowError(SimulationError);
  });

  it('ensures strictly monotonic sample ordering', () => {
    const grid = createCrankAngleGrid({ resolutionDeg: 2.0 });
    for (let i = 1; i < grid.samples.length; i++) {
      expect((grid.samples[i] ?? 0)).toBeGreaterThan((grid.samples[i - 1] ?? 0));
    }
  });
});
