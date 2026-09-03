import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEngineGeometry,
  validateOperatingConditions,
  validateSimulationModelInput,
  computeInputFingerprint,
} from '../src/index.js';
import { SimulationError } from '@engine-analyzer/contracts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('Simulation Input Validation', () => {
  it('validates a standard engine input and returns frozen object', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'engine-input-valid.json'), 'utf-8'));
    const input = validateSimulationModelInput(raw);

    expect(input.engine.boreMm).toBe(84.0);
    expect(input.operating.rpm).toBe(3000.0);
    expect(input.resolutionDeg).toBe(1.0);
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.engine)).toBe(true);
    expect(Object.isFrozen(input.operating)).toBe(true);
  });

  it('validates extreme physical boundary values successfully', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'engine-input-boundary.json'), 'utf-8'));
    const input = validateSimulationModelInput(raw);

    expect(input.engine.boreMm).toBe(20.0);
    expect(input.operating.rpm).toBe(100.0);
    expect(input.resolutionDeg).toBe(0.1);
  });

  it('rejects invalid inputs violating physical geometry constraints (rod shorter than crank radius)', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'engine-input-invalid.json'), 'utf-8'));
    expect(() => validateSimulationModelInput(raw)).toThrowError(SimulationError);

    try {
      validateSimulationModelInput(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects engine geometry when connecting rod length cannot span crank radius plus wrist-pin offset', () => {
    // Stroke = 90 (crank radius = 45), offset = 10 -> minimum rod > 55. Rod = 50 -> must reject
    expect(() =>
      validateEngineGeometry({
        boreMm: 84.0,
        strokeMm: 90.0,
        connectingRodLengthMm: 50.0,
        compressionRatio: 10.0,
        cylinderCount: 4,
        wristPinOffsetMm: 10.0,
      })
    ).toThrowError(SimulationError);

    // Negative offset: stroke = 90, offset = -12 -> minimum rod > 57. Rod = 55 -> must reject
    expect(() =>
      validateEngineGeometry({
        boreMm: 84.0,
        strokeMm: 90.0,
        connectingRodLengthMm: 55.0,
        compressionRatio: 10.0,
        cylinderCount: 4,
        wristPinOffsetMm: -12.0,
      })
    ).toThrowError(SimulationError);

    // Valid offset: stroke = 90, offset = 10, rod = 145 -> valid
    const valid = validateEngineGeometry({
      boreMm: 84.0,
      strokeMm: 90.0,
      connectingRodLengthMm: 145.0,
      compressionRatio: 10.0,
      cylinderCount: 4,
      wristPinOffsetMm: 10.0,
    });
    expect(valid.wristPinOffsetMm).toBe(10.0);
  });

  it('computes stable and deterministic input fingerprints', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'engine-input-valid.json'), 'utf-8'));
    const input1 = validateSimulationModelInput(raw);
    const input2 = validateSimulationModelInput(raw);

    const fp1 = computeInputFingerprint(input1);
    const fp2 = computeInputFingerprint(input2);

    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64); // SHA-256 hex length
  });

  it('proves fingerprint sensitivity to nested engine geometry, operating conditions, and camshaft timing', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'engine-input-valid.json'), 'utf-8'));
    const baseInput = validateSimulationModelInput(raw);
    const baseFp = computeInputFingerprint(baseInput);

    // 1. Bore variation
    const boreInput = validateSimulationModelInput({
      ...raw,
      engine: { ...raw.engine, boreMm: 85.0 },
    });
    expect(computeInputFingerprint(boreInput)).not.toBe(baseFp);

    // 2. Stroke variation
    const strokeInput = validateSimulationModelInput({
      ...raw,
      engine: { ...raw.engine, strokeMm: 92.0 },
    });
    expect(computeInputFingerprint(strokeInput)).not.toBe(baseFp);

    // 3. RPM variation
    const rpmInput = validateSimulationModelInput({
      ...raw,
      operating: { ...raw.operating, rpm: 4000.0 },
    });
    expect(computeInputFingerprint(rpmInput)).not.toBe(baseFp);

    // 4. Spark timing variation
    const sparkInput = validateSimulationModelInput({
      ...raw,
      operating: { ...raw.operating, sparkTimingDegBtdc: 24.0 },
    });
    expect(computeInputFingerprint(sparkInput)).not.toBe(baseFp);

    // 5. AFR variation
    const afrInput = validateSimulationModelInput({
      ...raw,
      operating: { ...raw.operating, airFuelRatio: 12.8 },
    });
    expect(computeInputFingerprint(afrInput)).not.toBe(baseFp);

    // 6. Camshaft timing addition/variation
    const camInput = validateSimulationModelInput({
      ...raw,
      engine: {
        ...raw.engine,
        camshaft: {
          intakeValveOpenDegBtdc: 12.0,
          intakeValveCloseDegAbdc: 54.0,
          exhaustValveOpenDegBbdc: 58.0,
          exhaustValveCloseDegAtdc: 18.0,
          intakeDurationDeg: 246.0,
          exhaustDurationDeg: 256.0,
        },
      },
    });
    expect(computeInputFingerprint(camInput)).not.toBe(baseFp);
  });

  it('validates camshaft timing configuration successfully', () => {
    const raw = {
      boreMm: 102.0,
      strokeMm: 92.0,
      connectingRodLengthMm: 155.0,
      compressionRatio: 11.0,
      cylinderCount: 8,
      camshaft: {
        intakeValveOpenDegBtdc: 20.0,
        intakeValveCloseDegAbdc: 65.0,
        exhaustValveOpenDegBbdc: 70.0,
        exhaustValveCloseDegAtdc: 25.0,
        intakeLiftMm: 14.5,
        exhaustLiftMm: 14.0,
      },
    };

    const geometry = validateEngineGeometry(raw);
    expect(geometry.cylinderCount).toBe(8);
    expect(geometry.camshaft?.intakeValveOpenDegBtdc).toBe(20.0);
    expect(geometry.camshaft?.intakeLiftMm).toBe(14.5);
  });
});
