import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationOrchestrator } from '../src/index.js';
import { InMemoryCalibrationRepository, BASELINE_NATURALLY_ASPIRATED_2L } from '@engine-analyzer/calibration';
import { PluginRegistry } from '@engine-analyzer/plugins';
import { BaselineEngineModel } from '@engine-analyzer/baseline-engine';
import { SimulationError } from '@engine-analyzer/contracts';

describe('Simulation Orchestration and Aggregation (Phase 5)', () => {
  let calRepo: InMemoryCalibrationRepository;
  let pluginRegistry: PluginRegistry;
  let orchestrator: SimulationOrchestrator;

  beforeEach(() => {
    calRepo = new InMemoryCalibrationRepository([BASELINE_NATURALLY_ASPIRATED_2L]);
    pluginRegistry = new PluginRegistry();
    pluginRegistry.register(new BaselineEngineModel());
    orchestrator = new SimulationOrchestrator({
      calibrationRepository: calRepo,
      pluginRegistry,
    });
  });

  const validRawInput = {
    engine: {
      boreMm: 84.0,
      strokeMm: 90.0,
      connectingRodLengthMm: 145.0,
      compressionRatio: 10.5,
      cylinderCount: 4,
      wristPinOffsetMm: 0.0,
    },
    operating: {
      rpm: 3000.0,
      intakePressureBar: 1.0,
      intakeTemperatureK: 298.15,
      sparkTimingDegBtdc: 18.0,
      airFuelRatio: 14.7,
      combustionDurationDeg: 45.0,
    },
    calibrationId: 'cal.baseline.naturally_aspirated_2l',
    calibrationVersion: '1.0.0',
    resolutionDeg: 1.0,
  };

  it('orchestrates end-to-end simulation successfully with provenance and channel verification', () => {
    const result = orchestrator.runSimulation(validRawInput);

    expect(result.schemaVersion).toBe('simulation-result/1');
    expect(result.status).toBe('SUCCESS');
    expect(result.model.id).toBe('model.four-stroke.baseline');
    expect(result.provenance.calibrationId).toBe('cal.baseline.naturally_aspirated_2l');
    expect(result.provenance.participatingModules.length).toBe(4);
    expect(result.channels.length).toBe(10);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('fails closed when input validation fails (e.g. negative RPM)', () => {
    const badInput = {
      ...validRawInput,
      operating: {
        ...validRawInput.operating,
        rpm: -500,
      },
    };

    expect(() => orchestrator.runSimulation(badInput)).toThrowError(SimulationError);
    try {
      orchestrator.runSimulation(badInput);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('fails closed when requested calibration dataset is missing', () => {
    const badInput = {
      ...validRawInput,
      calibrationId: 'cal.unknown.dataset',
    };

    expect(() => orchestrator.runSimulation(badInput)).toThrowError(SimulationError);
    try {
      orchestrator.runSimulation(badInput);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('CALIBRATION_NOT_FOUND');
    }
  });

  it('fails closed when unknown model plugin is requested', () => {
    expect(() => orchestrator.runSimulation(validRawInput, 'model.non.existent')).toThrowError(SimulationError);
    try {
      orchestrator.runSimulation(validRawInput, 'model.non.existent');
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('MODEL_NOT_FOUND');
    }
  });

  it('rejects simulation execution when model provenance input fingerprint does not match input', () => {
    // Create a mock model plugin that returns a stale/arbitrary input fingerprint
    const badModel = {
      manifest: {
        id: 'model.stale.fingerprint',
        name: 'Stale Fingerprint Model',
        version: '1.0.0',
        contractSchemaMajor: 1,
        capabilities: ['THERMODYNAMICS'],
        description: 'Test model returning mismatched provenance',
        supportedEngineTypes: ['FOUR_STROKE_OTTO'],
      },
      outputChannels: [{ id: 'cylinder_pressure_bar', name: 'Pressure', quantity: 'pressure' as const, unit: 'bar' }],
      simulate(input: any, calibration: any) {
        const standardResult = new BaselineEngineModel().simulate(input, calibration);
        return {
          ...standardResult,
          provenance: {
            ...standardResult.provenance,
            inputFingerprint: '0000000000000000000000000000000000000000000000000000000000000000', // Stale/mismatched
          },
        };
      },
    };
    pluginRegistry.register(badModel as any);

    expect(() => orchestrator.runSimulation(validRawInput, 'model.stale.fingerprint')).toThrowError(SimulationError);
    try {
      orchestrator.runSimulation(validRawInput, 'model.stale.fingerprint');
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('VALIDATION_FAILED');
      expect((err as SimulationError).message).toContain('does not match expected input fingerprint');
    }
  });

  it('executes V8 camshaft and ignition timing comparison vertical slice', () => {
    const v8BaselineInput = {
      engine: {
        boreMm: 102.0,
        strokeMm: 92.0,
        connectingRodLengthMm: 155.0,
        compressionRatio: 10.5,
        cylinderCount: 8,
        camshaft: {
          intakeValveOpenDegBtdc: 10.0,
          intakeValveCloseDegAbdc: 50.0,
          exhaustValveOpenDegBbdc: 55.0,
          exhaustValveCloseDegAtdc: 15.0,
          intakeDurationDeg: 240.0,
          exhaustDurationDeg: 250.0,
        },
      },
      operating: {
        rpm: 5500.0,
        intakePressureBar: 1.0,
        intakeTemperatureK: 300.0,
        sparkTimingDegBtdc: 16.0,
        airFuelRatio: 13.0,
        combustionDurationDeg: 42.0,
      },
      calibrationId: 'cal.baseline.naturally_aspirated_2l',
      calibrationVersion: '1.0.0',
      resolutionDeg: 1.0,
    };

    const v8PerformanceCamIgnitionInput = {
      ...v8BaselineInput,
      engine: {
        ...v8BaselineInput.engine,
        camshaft: {
          intakeValveOpenDegBtdc: 24.0,
          intakeValveCloseDegAbdc: 72.0,
          exhaustValveOpenDegBbdc: 76.0,
          exhaustValveCloseDegAtdc: 28.0,
          intakeDurationDeg: 276.0,
          exhaustDurationDeg: 284.0,
        },
      },
      operating: {
        ...v8BaselineInput.operating,
        sparkTimingDegBtdc: 24.0, // Advanced timing
        combustionDurationDeg: 38.0, // Faster burn
      },
    };

    const comparisonBundle = orchestrator.runComparison(v8BaselineInput, v8PerformanceCamIgnitionInput);

    expect(comparisonBundle.baseline.status).toBe('SUCCESS');
    expect(comparisonBundle.modified.status).toBe('SUCCESS');
    expect(comparisonBundle.comparison.schemaVersion).toBe('scenario-comparison/1');
    expect(comparisonBundle.comparison.summaryDeltas.brakePowerKw).toBeDefined();
    expect(comparisonBundle.comparison.summaryDeltas.brakePowerKw.absoluteDelta).toBeGreaterThan(0);
    expect(comparisonBundle.comparison.summaryDeltas.brakePowerKw.percentageDelta).toBeGreaterThan(0);
    expect(comparisonBundle.comparison.summaryDeltas.brakeTorqueNm).toBeDefined();
    expect(comparisonBundle.comparison.summaryDeltas.brakeTorqueNm.absoluteDelta).toBeGreaterThan(0);
    expect(comparisonBundle.comparison.channelDeltas.length).toBeGreaterThan(0);
    expect(comparisonBundle.comparison.narrativeSummary).toContain('Comparison between baseline');
    expect(comparisonBundle.comparison.keyFindings.length).toBeGreaterThan(0);
    expect(Object.isFrozen(comparisonBundle.comparison)).toBe(true);
  });

  it('isolates camshaft changes alone and asserts meaningful output changes', () => {
    const v8BaselineInput = {
      engine: {
        boreMm: 102.0,
        strokeMm: 92.0,
        connectingRodLengthMm: 155.0,
        compressionRatio: 10.5,
        cylinderCount: 8,
        camshaft: {
          intakeValveOpenDegBtdc: 10.0,
          intakeValveCloseDegAbdc: 50.0,
          exhaustValveOpenDegBbdc: 55.0,
          exhaustValveCloseDegAtdc: 15.0,
          intakeDurationDeg: 240.0,
          exhaustDurationDeg: 250.0,
        },
      },
      operating: {
        rpm: 5500.0,
        intakePressureBar: 1.0,
        intakeTemperatureK: 300.0,
        sparkTimingDegBtdc: 16.0,
        airFuelRatio: 13.0,
        combustionDurationDeg: 42.0,
      },
      calibrationId: 'cal.baseline.naturally_aspirated_2l',
      calibrationVersion: '1.0.0',
      resolutionDeg: 1.0,
    };

    // Modify ONLY camshaft timing — keep all operating conditions, spark timing, and combustion duration identical
    const v8CamOnlyModifiedInput = {
      ...v8BaselineInput,
      engine: {
        ...v8BaselineInput.engine,
        camshaft: {
          intakeValveOpenDegBtdc: 24.0,
          intakeValveCloseDegAbdc: 72.0,
          exhaustValveOpenDegBbdc: 76.0,
          exhaustValveCloseDegAtdc: 28.0,
          intakeDurationDeg: 276.0,
          exhaustDurationDeg: 284.0,
        },
      },
    };

    const comparisonBundle = orchestrator.runComparison(v8BaselineInput, v8CamOnlyModifiedInput);

    // Performance camshaft alone must produce higher volumetric efficiency, power, torque, and BMEP at 5500 RPM
    expect(comparisonBundle.comparison.summaryDeltas.brakePowerKw.absoluteDelta).toBeGreaterThan(5.0);
    expect(comparisonBundle.comparison.summaryDeltas.brakePowerKw.percentageDelta).toBeGreaterThan(2.0);
    expect(comparisonBundle.comparison.summaryDeltas.brakeTorqueNm.absoluteDelta).toBeGreaterThan(5.0);
    expect(comparisonBundle.comparison.summaryDeltas.brakeTorqueNm.percentageDelta).toBeGreaterThan(2.0);
    expect(comparisonBundle.comparison.summaryDeltas.imepBar.absoluteDelta).toBeGreaterThan(0.5);
    expect(comparisonBundle.comparison.summaryDeltas.bmepBar.absoluteDelta).toBeGreaterThan(0.5);

    // Pressure channel must show meaningful delta
    const pressureDelta = comparisonBundle.comparison.channelDeltas.find((c) => c.channelId === 'cylinder_pressure_bar');
    expect(pressureDelta).toBeDefined();
    expect(pressureDelta!.maxAbsoluteDelta).toBeGreaterThan(1.0);

    // Key findings should reflect the isolated camshaft upgrade
    expect(comparisonBundle.comparison.keyFindings.some((k) => k.includes('Brake power changed by +'))).toBe(true);
  });

  it('strictly rejects scenario comparison between results with incompatible crank angle grids', () => {
    const res720 = orchestrator.runSimulation(validRawInput);

    // Construct a simulated 360-degree result with 0.5-deg resolution (720 samples total)
    const res360SameCount = {
      ...res720,
      resultId: 'sim_360_res',
      crankAngleGrid: {
        convention: {
          conventionId: 'TWO_STROKE_TDC_0_360',
          cycleDegrees: 360 as const,
          zeroReference: 'TDC_FIRING' as const,
          direction: 'CLOCKWISE' as const,
          strokeCount: 2 as const,
          endpointIncluded: false,
        },
        startAngleDeg: 0,
        endAngleDeg: 360,
        resolutionDeg: 0.5,
        sampleCount: 720,
        samples: Array.from({ length: 720 }, (_, i) => i * 0.5),
      },
    };

    expect(() => orchestrator.compareScenarios(res720, res360SameCount as any)).toThrowError(SimulationError);
    try {
      orchestrator.compareScenarios(res720, res360SameCount as any);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('INCOMPATIBLE_ANGLE_GRID');
      expect((err as SimulationError).message).toContain('Cannot compare simulation results with incompatible crank angle grids');
    }
  });

  it('strictly rejects scenario comparison when matching channels have incompatible metadata', () => {
    const resBase = orchestrator.runSimulation(validRawInput);

    // Modified result where cylinder_pressure_bar has mismatched unit (psi instead of bar)
    const resMismatchedUnit = {
      ...resBase,
      resultId: 'sim_mismatched_unit',
      channels: resBase.channels.map((ch) =>
        ch.channelId === 'cylinder_pressure_bar' ? { ...ch, unit: 'psi' } : ch
      ),
    };

    expect(() => orchestrator.compareScenarios(resBase, resMismatchedUnit as any)).toThrowError(SimulationError);
    try {
      orchestrator.compareScenarios(resBase, resMismatchedUnit as any);
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).code).toBe('VALIDATION_FAILED');
      expect((err as SimulationError).message).toContain('Incompatible channel metadata');
    }
  });
});
