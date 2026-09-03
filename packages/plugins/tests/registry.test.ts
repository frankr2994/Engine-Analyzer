import { describe, it, expect } from 'vitest';
import { PluginRegistry, verifyModelConformance } from '../src/index.js';
import { BaselineEngineModel } from '@engine-analyzer/baseline-engine';
import { BASELINE_NATURALLY_ASPIRATED_2L } from '@engine-analyzer/calibration';
import { SimulationError, SimulationModel } from '@engine-analyzer/contracts';

describe('Plugin Registry and Extensibility (Phase 6)', () => {
  it('registers valid models and queries manifests', () => {
    const registry = new PluginRegistry();
    const baseline = new BaselineEngineModel();

    registry.register(baseline);
    expect(registry.hasModel('model.four-stroke.baseline')).toBe(true);

    const model = registry.getModel('model.four-stroke.baseline');
    expect(model.manifest.name).toBe('Four-Stroke Baseline Spark-Ignition Engine Model');

    const manifests = registry.listManifests();
    expect(manifests.length).toBe(1);
  });

  it('rejects duplicate model IDs with SimulationError', () => {
    const registry = new PluginRegistry();
    const m1 = new BaselineEngineModel();
    const m2 = new BaselineEngineModel();

    registry.register(m1);
    expect(() => registry.register(m2)).toThrowError(SimulationError);
    try {
      registry.register(m2);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('INCOMPATIBLE_PLUGIN');
    }
  });

  it('rejects plugin with incompatible schema major version', () => {
    const registry = new PluginRegistry();
    const badModel: SimulationModel = {
      manifest: {
        id: 'model.bad.major',
        name: 'Bad Major Model',
        version: '1.0.0',
        contractSchemaMajor: 2,
        capabilities: [],
        description: 'Test',
        supportedEngineTypes: ['FOUR_STROKE_OTTO'],
      } as unknown as SimulationModel['manifest'],
      outputChannels: [],
      simulate: () => {
        throw new Error('not implemented');
      },
    };

    expect(() => registry.register(badModel)).toThrowError(SimulationError);
  });

  it('passes generic model conformance suite on BaselineEngineModel', () => {
    const baseline = new BaselineEngineModel();
    const sampleInput = {
      engine: {
        boreMm: 84.0,
        strokeMm: 90.0,
        connectingRodLengthMm: 145.0,
        compressionRatio: 10.5,
        cylinderCount: 4,
      },
      operating: {
        rpm: 3000.0,
        intakePressureBar: 1.0,
        intakeTemperatureK: 298.15,
        sparkTimingDegBtdc: 18.0,
        airFuelRatio: 14.7,
      },
      calibrationId: 'cal.baseline.naturally_aspirated_2l',
      calibrationVersion: '1.0.0',
      resolutionDeg: 1.0,
    };

    expect(() => verifyModelConformance(baseline, sampleInput, BASELINE_NATURALLY_ASPIRATED_2L)).not.toThrow();
  });
});
