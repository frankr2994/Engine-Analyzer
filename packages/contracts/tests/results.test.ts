import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCalculationResultV1,
  parseSimulationResultV1,
  SimulationError,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('Contracts Schema Validation and Result Envelopes', () => {
  it('successfully parses and freezes a valid CalculationResultV1 fixture', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'valid-calculation-result.json'), 'utf-8'));
    const result = parseCalculationResultV1(raw);

    expect(result.schemaVersion).toBe('calculation-result/1');
    expect(result.module.id).toBe('module.thermodynamics.otto');
    expect(result.crankAngle?.angleDegrees).toBe(180.0);
    expect(result.value['pressureBar']).toBe(2.45);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.module)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it('rejects invalid CalculationResultV1 with structured SimulationError', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'invalid-calculation-result.json'), 'utf-8'));
    expect(() => parseCalculationResultV1(raw)).toThrowError(SimulationError);
  });

  it('fails closed when schema version is unknown', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'unknown-version-result.json'), 'utf-8'));
    expect(() => parseCalculationResultV1(raw)).toThrowError(/UNKNOWN_SCHEMA_VERSION/);
    try {
      parseCalculationResultV1(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('UNKNOWN_SCHEMA_VERSION');
    }
  });

  it('successfully parses and round-trips a valid SimulationResultV1 fixture', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'valid-simulation-result.json'), 'utf-8'));
    const result = parseSimulationResultV1(raw);

    expect(result.schemaVersion).toBe('simulation-result/1');
    expect(result.channels.length).toBe(2);
    expect(result.channels[0]?.channelId).toBe('cylinder_pressure_bar');
    expect(result.summary.indicatedPowerKw).toBe(85.5);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.channels[0]?.samples)).toBe(true);

    // Round-trip serialization determinism
    const serialized = JSON.stringify(result);
    const reparsed = parseSimulationResultV1(JSON.parse(serialized));
    expect(reparsed).toEqual(result);
  });

  it('rejects invalid SimulationResultV1 with channel sample length mismatch', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'invalid-simulation-result.json'), 'utf-8'));
    expect(() => parseSimulationResultV1(raw)).toThrowError(SimulationError);
  });
});
