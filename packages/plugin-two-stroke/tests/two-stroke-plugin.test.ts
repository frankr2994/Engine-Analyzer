import { describe, it, expect } from 'vitest';
import { TwoStrokeEngineModel } from '../src/index.js';
import { InMemoryCalibrationRepository, BASELINE_NATURALLY_ASPIRATED_2L } from '@engine-analyzer/calibration';
import { PluginRegistry, verifyModelConformance } from '@engine-analyzer/plugins';
import { SimulationOrchestrator } from '@engine-analyzer/orchestrator';
import { parseSimulationResultV1 } from '@engine-analyzer/contracts';

describe('Two-Stroke Engine Model Plugin (Phase 8 Extensibility Proof)', () => {
  const model = new TwoStrokeEngineModel();

  const sampleInput = {
    engine: {
      boreMm: 54.0,
      strokeMm: 54.0,
      connectingRodLengthMm: 110.0,
      compressionRatio: 8.5,
      cylinderCount: 1,
    },
    operating: {
      rpm: 8000.0,
      intakePressureBar: 1.0,
      intakeTemperatureK: 298.15,
      sparkTimingDegBtdc: 20.0,
      airFuelRatio: 12.5,
      combustionDurationDeg: 30.0,
    },
    calibrationId: 'cal.baseline.naturally_aspirated_2l',
    calibrationVersion: '1.0.0',
    resolutionDeg: 1.0,
  };

  it('conforms to generic model conformance suite over 360 deg cycle', () => {
    expect(() => verifyModelConformance(model, sampleInput, BASELINE_NATURALLY_ASPIRATED_2L)).not.toThrow();

    const result = model.simulate(sampleInput, BASELINE_NATURALLY_ASPIRATED_2L);
    expect(result.crankAngleGrid.convention.cycleDegrees).toBe(360);
    expect(result.crankAngleGrid.sampleCount).toBe(360);
    expect(result.channels.length).toBe(9);
  });

  it('runs seamlessly through SimulationOrchestrator without modifying orchestrator or presentation code', () => {
    const calRepo = new InMemoryCalibrationRepository([BASELINE_NATURALLY_ASPIRATED_2L]);
    const registry = new PluginRegistry();
    registry.register(model);

    const orchestrator = new SimulationOrchestrator({
      calibrationRepository: calRepo,
      pluginRegistry: registry,
    });

    const result = orchestrator.runSimulation(sampleInput, 'model.two-stroke.baseline');

    const validated = parseSimulationResultV1(result);
    expect(validated.model.id).toBe('model.two-stroke.baseline');
    expect(validated.status).toBe('SUCCESS');
    expect(validated.summary.indicatedPowerKw).toBeGreaterThan(5.0);
  });
});
