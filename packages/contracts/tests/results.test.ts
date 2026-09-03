import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCalculationResultV1,
  parseSimulationResultV1,
  parseCalibrationDataset,
  SimulationResultV1Schema,
  CalibrationParameterSchema,
  CalibrationTable1DSchema,
  CalibrationDatasetSchema,
  CrankAngleGridSchema,
  SimulationError,
  FOUR_STROKE_TDC_CONVENTION,
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

  it('validates CrankAngleGrid invariants: count, monotonicity, finiteness, and bounds', () => {
    // Valid grid
    const valid = CrankAngleGridSchema.safeParse({
      convention: FOUR_STROKE_TDC_CONVENTION,
      startAngleDeg: 0,
      endAngleDeg: 720,
      resolutionDeg: 1.0,
      sampleCount: 4,
      samples: [0, 1, 2, 3],
    });
    expect(valid.success).toBe(true);

    // Mismatched sampleCount
    const countMismatch = CrankAngleGridSchema.safeParse({
      convention: FOUR_STROKE_TDC_CONVENTION,
      startAngleDeg: 0,
      endAngleDeg: 720,
      resolutionDeg: 1.0,
      sampleCount: 10,
      samples: [0, 1, 2, 3],
    });
    expect(countMismatch.success).toBe(false);

    // Non-integer sampleCount
    const nonIntCount = CrankAngleGridSchema.safeParse({
      convention: FOUR_STROKE_TDC_CONVENTION,
      startAngleDeg: 0,
      endAngleDeg: 720,
      resolutionDeg: 1.0,
      sampleCount: 4.5,
      samples: [0, 1, 2, 3],
    });
    expect(nonIntCount.success).toBe(false);

    // Non-monotonic samples
    const nonMono = CrankAngleGridSchema.safeParse({
      convention: FOUR_STROKE_TDC_CONVENTION,
      startAngleDeg: 0,
      endAngleDeg: 720,
      resolutionDeg: 1.0,
      sampleCount: 4,
      samples: [0, 2, 1, 3],
    });
    expect(nonMono.success).toBe(false);

    // Non-finite sample
    const nonFinite = CrankAngleGridSchema.safeParse({
      convention: FOUR_STROKE_TDC_CONVENTION,
      startAngleDeg: 0,
      endAngleDeg: 720,
      resolutionDeg: 1.0,
      sampleCount: 4,
      samples: [0, 1, NaN, 3],
    });
    expect(nonFinite.success).toBe(false);
  });

  it('recomputes and enforces channel statistics consistency in parseSimulationResultV1', () => {
    const validRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'valid-simulation-result.json'), 'utf-8'));

    // Tamper with min
    const tamperedMin = {
      ...validRaw,
      channels: [
        {
          ...validRaw.channels[0],
          min: 999.0, // False declared min
        },
        validRaw.channels[1],
      ],
    };
    expect(() => parseSimulationResultV1(tamperedMin)).toThrowError(SimulationError);

    // Tamper with mean
    const tamperedMean = {
      ...validRaw,
      channels: [
        {
          ...validRaw.channels[0],
          mean: 0.0, // False declared mean
        },
        validRaw.channels[1],
      ],
    };
    expect(() => parseSimulationResultV1(tamperedMean)).toThrowError(SimulationError);

    // Exact 1e-6 tolerance boundary test:
    // 1. Discrepancy beyond 1e-6 (e.g. +2e-6) must be rejected
    const beyondTolMin = {
      ...validRaw,
      channels: [
        {
          ...validRaw.channels[0],
          min: validRaw.channels[0].min + 2e-6,
        },
        validRaw.channels[1],
      ],
    };
    expect(() => parseSimulationResultV1(beyondTolMin)).toThrowError(SimulationError);

    const beyondTolMean = {
      ...validRaw,
      channels: [
        {
          ...validRaw.channels[0],
          mean: validRaw.channels[0].mean + 2e-6,
        },
        validRaw.channels[1],
      ],
    };
    expect(() => parseSimulationResultV1(beyondTolMean)).toThrowError(SimulationError);

    // 2. Discrepancy within 1e-6 (e.g. +5e-7) must be accepted
    const withinTol = {
      ...validRaw,
      channels: [
        {
          ...validRaw.channels[0],
          min: validRaw.channels[0].min + 5e-7,
          mean: validRaw.channels[0].mean + 5e-7,
          max: validRaw.channels[0].max - 5e-7,
        },
        validRaw.channels[1],
      ],
    };
    expect(() => parseSimulationResultV1(withinTol)).not.toThrow();
  });

  it('directly rejects forged channel statistics and mismatched grid samples via SimulationResultV1Schema', () => {
    const validRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'valid-simulation-result.json'), 'utf-8'));

    // 1. Direct schema parse succeeds on valid result
    const validParse = SimulationResultV1Schema.safeParse(validRaw);
    expect(validParse.success).toBe(true);

    // 2. Direct schema parse rejects forged min
    const forgedMin = {
      ...validRaw,
      channels: [
        { ...validRaw.channels[0], min: 999.0 },
        validRaw.channels[1],
      ],
    };
    const forgedMinParse = SimulationResultV1Schema.safeParse(forgedMin);
    expect(forgedMinParse.success).toBe(false);
    expect(forgedMinParse.error?.issues.some((i) => i.message.includes('declared min'))).toBe(true);

    // 3. Direct schema parse rejects forged max
    const forgedMax = {
      ...validRaw,
      channels: [
        { ...validRaw.channels[0], max: -50.0 },
        validRaw.channels[1],
      ],
    };
    const forgedMaxParse = SimulationResultV1Schema.safeParse(forgedMax);
    expect(forgedMaxParse.success).toBe(false);
    expect(forgedMaxParse.error?.issues.some((i) => i.message.includes('declared max'))).toBe(true);

    // 4. Direct schema parse rejects forged mean
    const forgedMean = {
      ...validRaw,
      channels: [
        { ...validRaw.channels[0], mean: 0.0 },
        validRaw.channels[1],
      ],
    };
    const forgedMeanParse = SimulationResultV1Schema.safeParse(forgedMean);
    expect(forgedMeanParse.success).toBe(false);
    expect(forgedMeanParse.error?.issues.some((i) => i.message.includes('declared mean'))).toBe(true);

    // 5. Direct schema parse rejects channel sample count mismatch
    const mismatchedSamples = {
      ...validRaw,
      channels: [
        { ...validRaw.channels[0], samples: [1.0, 2.0] },
        validRaw.channels[1],
      ],
    };
    const mismatchedParse = SimulationResultV1Schema.safeParse(mismatchedSamples);
    expect(mismatchedParse.success).toBe(false);
    expect(mismatchedParse.error?.issues.some((i) => i.message.includes('sample count'))).toBe(true);
  });

  it('validates calibration parameter bounds and finite values via schema', () => {
    const valid = CalibrationParameterSchema.safeParse({
      name: 'gamma',
      value: 1.35,
      unit: 'ratio',
      description: 'Specific heat ratio',
      min: 1.0,
      max: 2.0,
    });
    expect(valid.success).toBe(true);

    const nonFinite = CalibrationParameterSchema.safeParse({
      name: 'gamma',
      value: NaN,
      unit: 'ratio',
      description: 'Specific heat ratio',
    });
    expect(nonFinite.success).toBe(false);

    const tooLow = CalibrationParameterSchema.safeParse({
      name: 'gamma',
      value: 0.8,
      unit: 'ratio',
      description: 'Specific heat ratio',
      min: 1.0,
      max: 2.0,
    });
    expect(tooLow.success).toBe(false);
  });

  it('enforces parameter and table key/name equality in CalibrationDatasetSchema', () => {
    // Key matches name
    const validDataset = {
      schemaVersion: 'calibration-dataset/1',
      id: 'calib_1',
      version: '1.0.0',
      name: 'Test Dataset',
      description: 'Valid',
      contentHash: 'hash123',
      parameters: {
        gamma: { name: 'gamma', value: 1.35, unit: 'ratio', description: 'desc' },
      },
      tables1D: {
        ve_table: { name: 've_table', xUnit: 'rpm', yUnit: 'ratio', xValues: [1000, 2000], yValues: [0.8, 0.9] },
      },
    };
    expect(CalibrationDatasetSchema.safeParse(validDataset).success).toBe(true);

    // Parameter key mismatch
    const mismatchedParamKey = {
      ...validDataset,
      parameters: {
        gammaKey: { name: 'otherName', value: 1.35, unit: 'ratio', description: 'desc' },
      },
    };
    expect(CalibrationDatasetSchema.safeParse(mismatchedParamKey).success).toBe(false);

    // Table key mismatch
    const mismatchedTableKey = {
      ...validDataset,
      tables1D: {
        ve_table_key: { name: 'different_name', xUnit: 'rpm', yUnit: 'ratio', xValues: [1000, 2000], yValues: [0.8, 0.9] },
      },
    };
    expect(CalibrationDatasetSchema.safeParse(mismatchedTableKey).success).toBe(false);
  });

  it('validates calibration table 1D non-empty, matching lengths, finite values, and strict monotonicity', () => {
    const valid = CalibrationTable1DSchema.safeParse({
      name: 've_table',
      xUnit: 'rpm',
      yUnit: 'ratio',
      xValues: [1000, 2000, 3000, 4000],
      yValues: [0.8, 0.85, 0.9, 0.88],
    });
    expect(valid.success).toBe(true);

    const empty = CalibrationTable1DSchema.safeParse({
      name: 've_table',
      xUnit: 'rpm',
      yUnit: 'ratio',
      xValues: [],
      yValues: [],
    });
    expect(empty.success).toBe(false);

    const mismatched = CalibrationTable1DSchema.safeParse({
      name: 've_table',
      xUnit: 'rpm',
      yUnit: 'ratio',
      xValues: [1000, 2000],
      yValues: [0.8],
    });
    expect(mismatched.success).toBe(false);

    const nonMonotonic = CalibrationTable1DSchema.safeParse({
      name: 've_table',
      xUnit: 'rpm',
      yUnit: 'ratio',
      xValues: [1000, 2000, 2000, 4000],
      yValues: [0.8, 0.85, 0.88, 0.9],
    });
    expect(nonMonotonic.success).toBe(false);
  });
});
