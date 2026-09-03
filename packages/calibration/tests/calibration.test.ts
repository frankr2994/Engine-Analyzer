import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InMemoryCalibrationRepository,
  BASELINE_NATURALLY_ASPIRATED_2L,
  PERFORMANCE_TURBO_2L,
  computeCalibrationHash,
} from '../src/index.js';
import { SimulationError } from '@engine-analyzer/contracts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('Calibration Repository and Integrity', () => {
  it('loads built-in authoritative datasets and retrieves them by ID and version', () => {
    const repo = new InMemoryCalibrationRepository([
      BASELINE_NATURALLY_ASPIRATED_2L,
      PERFORMANCE_TURBO_2L,
    ]);

    expect(repo.has('cal.baseline.naturally_aspirated_2l', '1.0.0')).toBe(true);
    const ds = repo.get('cal.baseline.naturally_aspirated_2l', '1.0.0');

    expect(ds.id).toBe('cal.baseline.naturally_aspirated_2l');
    expect(ds.parameters['gammaCompression']?.value).toBe(1.34);
    expect(Object.isFrozen(ds)).toBe(true);
  });

  it('fails closed when calibration dataset is not found', () => {
    const repo = new InMemoryCalibrationRepository([BASELINE_NATURALLY_ASPIRATED_2L]);

    expect(() => repo.get('non.existent.id', '1.0.0')).toThrowError(SimulationError);
    try {
      repo.get('non.existent.id', '1.0.0');
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('CALIBRATION_NOT_FOUND');
    }
  });

  it('rejects corrupt datasets with tampered content hash', () => {
    const repo = new InMemoryCalibrationRepository();
    const corruptRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'corrupt-hash-dataset.json'), 'utf-8'));

    expect(() => repo.register(corruptRaw)).toThrowError(SimulationError);
    try {
      repo.register(corruptRaw);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('CALIBRATION_CORRUPT');
    }
  });

  it('registers valid custom calibration dataset and verifies content hash calculation', () => {
    const repo = new InMemoryCalibrationRepository();
    const datasetWithoutHash = {
      schemaVersion: 'calibration-dataset/1' as const,
      id: 'cal.test.custom',
      version: '1.0.0',
      name: 'Test Calibration Dataset',
      description: 'Test dataset for unit verification',
      parameters: {
        gammaCompression: {
          name: 'gammaCompression',
          value: 1.35,
          unit: 'ratio',
          description: 'Compression gamma',
        },
      },
    };
    const contentHash = computeCalibrationHash(datasetWithoutHash);
    const validDataset = {
      ...datasetWithoutHash,
      contentHash,
    };

    repo.register(validDataset);
    expect(repo.has('cal.test.custom', '1.0.0')).toBe(true);
    const retrieved = repo.get('cal.test.custom', '1.0.0');
    expect(retrieved.name).toBe('Test Calibration Dataset');
    expect(retrieved.contentHash).toBe(contentHash);
  });
});
