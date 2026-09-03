import { describe, it, expect } from 'vitest';
import { TwoStrokeEngineModel } from '../src/index.js';
import { InMemoryCalibrationRepository, BASELINE_NATURALLY_ASPIRATED_2L } from '@engine-analyzer/calibration';
import { PluginRegistry, verifyModelConformance } from '@engine-analyzer/plugins';
import { SimulationOrchestrator } from '@engine-analyzer/orchestrator';
import { parseSimulationResultV1, CalibrationDataset, SimulationError } from '@engine-analyzer/contracts';

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

  it('computes exact and verified channel statistics without fallback approximations', () => {
    const result = model.simulate(sampleInput, BASELINE_NATURALLY_ASPIRATED_2L);
    const volChannel = result.channels.find((c) => c.channelId === 'cylinder_volume_cm3')!;
    const pressChannel = result.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!;
    const torqueChannel = result.channels.find((c) => c.channelId === 'instantaneous_torque_nm')!;

    expect(volChannel).toBeDefined();
    expect(volChannel.min).toBe(Math.min(...volChannel.samples));
    expect(volChannel.max).toBe(Math.max(...volChannel.samples));
    expect(volChannel.mean).toBeCloseTo(
      volChannel.samples.reduce((a, b) => a + b, 0) / volChannel.samples.length,
      5
    );

    expect(pressChannel.min).toBe(Math.min(...pressChannel.samples));
    expect(pressChannel.max).toBe(Math.max(...pressChannel.samples));

    expect(torqueChannel.samples.every((s) => Number.isFinite(s))).toBe(true);
  });

  it('dynamically computes fuel mass, efficiencies, and BSFC when inputs change (e.g. lean AFR)', () => {
    const richResult = model.simulate(sampleInput, BASELINE_NATURALLY_ASPIRATED_2L);

    const leanInput = {
      ...sampleInput,
      operating: {
        ...sampleInput.operating,
        airFuelRatio: 16.0, // Lean mixture
      },
    };
    const leanResult = model.simulate(leanInput, BASELINE_NATURALLY_ASPIRATED_2L);

    // Fuel mass must be lower for lean mixture
    expect(leanResult.summary.fuelMassPerCycleG).toBeLessThan(richResult.summary.fuelMassPerCycleG);
    // BSFC and power must change dynamically rather than remaining hardcoded
    expect(leanResult.summary.specificFuelConsumptionGBhpKwh).not.toBe(richResult.summary.specificFuelConsumptionGBhpKwh);
    expect(leanResult.summary.indicatedThermalEfficiencyPct).toBeGreaterThan(0);
    expect(leanResult.summary.brakeThermalEfficiencyPct).toBeGreaterThan(0);
  });

  it('dynamically responds to delivery ratio and trapping efficiency calibration parameters', () => {
    const baseResult = model.simulate(sampleInput, BASELINE_NATURALLY_ASPIRATED_2L);

    // High scavenge flow calibration (e.g. tuned expansion chamber and porting)
    const highScavengeCalib: CalibrationDataset = {
      ...BASELINE_NATURALLY_ASPIRATED_2L,
      parameters: {
        ...BASELINE_NATURALLY_ASPIRATED_2L.parameters,
        deliveryRatio: {
          name: 'deliveryRatio',
          value: 0.95, // Increased delivery ratio
          unit: 'ratio',
          description: 'Delivered charge volume relative to displacement',
        },
        trappingEfficiency: {
          name: 'trappingEfficiency',
          value: 0.80, // Increased trapping efficiency
          unit: 'ratio',
          description: 'Fraction of delivered charge retained in cylinder',
        },
      },
    };

    const tunedResult = model.simulate(sampleInput, highScavengeCalib);

    // Higher delivery ratio and trapping efficiency must trap more charge and consume more fuel per cycle
    expect(tunedResult.summary.fuelMassPerCycleG).toBeGreaterThan(baseResult.summary.fuelMassPerCycleG);
    // Indicated and brake power must increase accordingly
    expect(tunedResult.summary.indicatedPowerKw).toBeGreaterThan(baseResult.summary.indicatedPowerKw);
    expect(tunedResult.summary.brakePowerKw).toBeGreaterThan(baseResult.summary.brakePowerKw);
  });

  it('calculates trapped charge mass based on actual port closure volume vPort', () => {
    const baseResult = model.simulate(sampleInput, BASELINE_NATURALLY_ASPIRATED_2L);

    // Long stroke engine has larger port volume at 260 deg
    const longStrokeInput = {
      ...sampleInput,
      engine: {
        ...sampleInput.engine,
        strokeMm: 60.0, // Increased stroke increases vPort
      },
    };
    const longStrokeResult = model.simulate(longStrokeInput, BASELINE_NATURALLY_ASPIRATED_2L);

    expect(longStrokeResult.summary.fuelMassPerCycleG).toBeGreaterThan(baseResult.summary.fuelMassPerCycleG);
  });

  it('preserves completed Wiebe burn state continuously across expansion until 180 deg scavenging boundary', () => {
    const result = model.simulate(sampleInput, BASELINE_NATURALLY_ASPIRATED_2L);
    const pSamples = result.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!.samples;
    const xbSamples = result.channels.find((c) => c.channelId === 'mass_fraction_burned')!.samples;

    // For 20 deg BTDC and 30 deg burn duration, combustion completes at 10 deg ATDC (relSpark >= 30)
    // From theta = 30 deg all the way to 179 deg, xb MUST remain 1.0 without resetting early
    for (let deg = 30; deg < 180; deg++) {
      expect(xbSamples[deg]).toBe(1.0);
    }

    // At scavenging boundary (180..259 deg), xb must be 0.0
    for (let deg = 180; deg < 260; deg++) {
      expect(xbSamples[deg]).toBe(0.0);
    }

    // Specifically test around 160..165 deg to ensure no premature drop in pressure
    expect(pSamples[160]).toBeGreaterThan(0.5);
    expect(pSamples[161]).toBeGreaterThan(0.5);
    expect(pSamples[161]!).toBeLessThan(pSamples[160]!); // Monotonic expansion decay
    expect(Math.abs(pSamples[161]! - pSamples[160]!)).toBeLessThan(0.1); // Continuous gradient
  });

  it('strictly rejects scavenging calibration parameters outside physical domain', () => {
    // Negative delivery ratio
    const negDeliveryCalib: CalibrationDataset = {
      ...BASELINE_NATURALLY_ASPIRATED_2L,
      parameters: {
        ...BASELINE_NATURALLY_ASPIRATED_2L.parameters,
        deliveryRatio: {
          name: 'deliveryRatio',
          value: -0.2,
          unit: 'ratio',
          description: 'Invalid negative delivery ratio',
        },
      },
    };
    expect(() => model.simulate(sampleInput, negDeliveryCalib)).toThrowError(SimulationError);

    // Impossible trapping efficiency > 1.0 (over 100%)
    const overTrappingCalib: CalibrationDataset = {
      ...BASELINE_NATURALLY_ASPIRATED_2L,
      parameters: {
        ...BASELINE_NATURALLY_ASPIRATED_2L.parameters,
        trappingEfficiency: {
          name: 'trappingEfficiency',
          value: 1.5,
          unit: 'ratio',
          description: 'Invalid trapping efficiency > 100%',
        },
      },
    };
    expect(() => model.simulate(sampleInput, overTrappingCalib)).toThrowError(SimulationError);

    // Negative trapping efficiency
    const negTrappingCalib: CalibrationDataset = {
      ...BASELINE_NATURALLY_ASPIRATED_2L,
      parameters: {
        ...BASELINE_NATURALLY_ASPIRATED_2L.parameters,
        trappingEfficiency: {
          name: 'trappingEfficiency',
          value: -0.1,
          unit: 'ratio',
          description: 'Invalid negative trapping efficiency',
        },
      },
    };
    expect(() => model.simulate(sampleInput, negTrappingCalib)).toThrowError(SimulationError);
  });

  it('correctly models after-TDC spark timing without premature TDC peak pressure', () => {
    // Retarded spark timing after TDC: sparkTimingDegBtdc = -10 (10 deg ATDC)
    const retardedInput = {
      ...sampleInput,
      operating: {
        ...sampleInput.operating,
        sparkTimingDegBtdc: -10.0,
      },
    };
    const retardedResult = model.simulate(retardedInput, BASELINE_NATURALLY_ASPIRATED_2L);
    const pressureSamples = retardedResult.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!.samples;
    const xbSamples = retardedResult.channels.find((c) => c.channelId === 'mass_fraction_burned')!.samples;

    // At TDC (sample index 0, theta = 0 deg), mass fraction burned must be 0 because spark is at 10 deg ATDC
    expect(xbSamples[0]).toBe(0.0);
    // Peak pressure should occur well after TDC (theta >= 10 deg)
    const peakIdx = pressureSamples.indexOf(Math.max(...pressureSamples));
    expect(peakIdx).toBeGreaterThanOrEqual(10);
  });
});
