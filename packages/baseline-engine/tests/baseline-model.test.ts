import { describe, it, expect } from 'vitest';
import { BaselineEngineModel } from '../src/index.js';
import { BASELINE_NATURALLY_ASPIRATED_2L } from '@engine-analyzer/calibration';
import { SimulationModelInput, parseSimulationResultV1 } from '@engine-analyzer/contracts';

describe('Baseline Engine Simulation Model (Phase 4)', () => {
  const model = new BaselineEngineModel();

  const standardInput: SimulationModelInput = {
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

  it('runs complete 4-stroke simulation and conforms to SimulationResultV1 schema', () => {
    const result = model.simulate(standardInput, BASELINE_NATURALLY_ASPIRATED_2L);

    // Conformance with contracts parser
    const validated = parseSimulationResultV1(result);
    expect(validated.schemaVersion).toBe('simulation-result/1');
    expect(validated.resultId).toBeDefined();
    expect(validated.normalizedConfiguration).toBeDefined();
    expect(validated.assumptions.length).toBeGreaterThan(0);
    expect(validated.confidence.confidenceLevel).toBe('HIGH');
    expect(validated.explainability.contributions.length).toBeGreaterThan(0);
    expect(validated.model.id).toBe('model.four-stroke.baseline');
    expect(validated.status).toBe('SUCCESS');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('proves combustion state continuity through the complete power/expansion stroke (0 to 180 deg)', () => {
    const result = model.simulate(standardInput, BASELINE_NATURALLY_ASPIRATED_2L);
    const xbChan = result.channels.find((c) => c.channelId === 'mass_fraction_burned')!;
    const pChan = result.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!;

    // Spark is at 18 deg BTDC (702 deg). Duration is 45 deg -> Burn completes at 27 deg ATDC.
    // For all angles from 27 deg through 179 deg (including 163 deg), xb must be exactly 1.0
    for (let theta = 27; theta < 180; theta++) {
      const xb = xbChan.samples[theta];
      expect(xb, `Mass fraction burned at ${theta} deg must be 1.0 (no reset)`).toBe(1.0);
    }

    // Explicit check at 163 deg (the angle identified in Codex review blocker)
    expect(xbChan.samples[163]).toBe(1.0);
    // Pressure at 163 deg must maintain thermodynamic expansion above motored/ambient pressure
    expect(pChan.samples[163]).toBeGreaterThan(1.5);
    // Pressure must expand monotonically from peak without sudden discontinuity before 140 deg EVO
    for (let theta = 30; theta < 140; theta++) {
      expect(pChan.samples[theta]).toBeGreaterThanOrEqual(pChan.samples[theta + 1]!);
    }
  });

  it('verifies physical conservation invariants across all channels', () => {
    const result = model.simulate(standardInput, BASELINE_NATURALLY_ASPIRATED_2L);

    const pChan = result.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!;
    const vChan = result.channels.find((c) => c.channelId === 'cylinder_volume_cm3')!;
    const tChan = result.channels.find((c) => c.channelId === 'in_cylinder_temp_k')!;
    const xbChan = result.channels.find((c) => c.channelId === 'mass_fraction_burned')!;
    const posChan = result.channels.find((c) => c.channelId === 'piston_position_mm')!;

    // 720 samples for 1 deg resolution
    expect(result.crankAngleGrid.sampleCount).toBe(720);
    expect(pChan.samples.length).toBe(720);
    expect(vChan.samples.length).toBe(720);

    // Physical bounds:
    // Pressure > 0, Volume > 0, Temp > 0
    expect(pChan.min).toBeGreaterThan(0.5);
    expect(pChan.max).toBeGreaterThan(30.0); // Peak combustion pressure
    expect(vChan.min).toBeGreaterThan(40.0);
    expect(tChan.min).toBeGreaterThan(250.0);
    expect(tChan.max).toBeGreaterThan(1500.0); // Peak combustion temperature

    // Mass fraction burned 0 <= xb <= 1
    expect(xbChan.min).toBe(0.0);
    expect(xbChan.max).toBe(1.0);

    // Piston position 0 <= pos <= stroke
    expect(posChan.min).toBeCloseTo(0.0, 4);
    expect(posChan.max).toBeCloseTo(standardInput.engine.strokeMm, 4);
  });

  it('produces realistic performance summary for 2.0L 4-cyl engine at 3000 RPM', () => {
    const result = model.simulate(standardInput, BASELINE_NATURALLY_ASPIRATED_2L);
    const summary = result.summary;

    // Power & Torque ranges for ~2.0L NA 4-cylinder at 3000 RPM:
    // Indicated power ~45 - 80 kW, Brake power ~35 - 70 kW
    expect(summary.indicatedPowerKw).toBeGreaterThan(40.0);
    expect(summary.indicatedPowerKw).toBeLessThan(90.0);
    expect(summary.brakePowerKw).toBeGreaterThan(30.0);
    expect(summary.brakePowerKw).toBeLessThan(80.0);

    // IMEP & BMEP: ~8-14 bar IMEP, ~7-12 bar BMEP
    expect(summary.imepBar).toBeGreaterThan(7.0);
    expect(summary.imepBar).toBeLessThan(16.0);
    expect(summary.bmepBar).toBeGreaterThan(5.0);
    expect(summary.bmepBar).toBeLessThan(summary.imepBar);

    // Thermal efficiencies
    expect(summary.indicatedThermalEfficiencyPct).toBeGreaterThan(25.0);
    expect(summary.indicatedThermalEfficiencyPct).toBeLessThan(48.0);
    expect(summary.brakeThermalEfficiencyPct).toBeGreaterThan(20.0);
    expect(summary.brakeThermalEfficiencyPct).toBeLessThan(summary.indicatedThermalEfficiencyPct);
    expect(summary.mechanicalEfficiencyPct).toBeGreaterThan(70.0);
    expect(summary.mechanicalEfficiencyPct).toBeLessThan(98.0);
  });

  it('guarantees deterministic output across multiple runs', () => {
    const res1 = model.simulate(standardInput, BASELINE_NATURALLY_ASPIRATED_2L);
    const res2 = model.simulate(standardInput, BASELINE_NATURALLY_ASPIRATED_2L);

    expect(res1.summary).toEqual(res2.summary);
    expect(res1.channels[0]?.samples).toEqual(res2.channels[0]?.samples);
  });

  it('responds dynamically to camshaft timing changes with meaningful differences in power, torque, and pressure', () => {
    const baselineCamInput: SimulationModelInput = {
      ...standardInput,
      operating: {
        ...standardInput.operating,
        rpm: 6000.0,
      },
      engine: {
        ...standardInput.engine,
        camshaft: {
          intakeValveOpenDegBtdc: 10.0,
          intakeValveCloseDegAbdc: 45.0,
          exhaustValveOpenDegBbdc: 50.0,
          exhaustValveCloseDegAtdc: 10.0,
          intakeDurationDeg: 235.0,
          exhaustDurationDeg: 240.0,
        },
      },
    };

    const performanceCamInput: SimulationModelInput = {
      ...baselineCamInput,
      engine: {
        ...baselineCamInput.engine,
        camshaft: {
          intakeValveOpenDegBtdc: 25.0,
          intakeValveCloseDegAbdc: 70.0,
          exhaustValveOpenDegBbdc: 70.0,
          exhaustValveCloseDegAtdc: 25.0,
          intakeDurationDeg: 275.0,
          exhaustDurationDeg: 275.0,
        },
      },
    };

    const baselineResult = model.simulate(baselineCamInput, BASELINE_NATURALLY_ASPIRATED_2L);
    const perfResult = model.simulate(performanceCamInput, BASELINE_NATURALLY_ASPIRATED_2L);

    // Performance camshaft at 6000 RPM must produce higher power and torque due to improved high-speed volumetric efficiency
    expect(perfResult.summary.brakePowerKw).toBeGreaterThan(baselineResult.summary.brakePowerKw);
    expect(perfResult.summary.brakeTorqueNm).toBeGreaterThan(baselineResult.summary.brakeTorqueNm);
    expect(perfResult.summary.indicatedPowerKw).toBeGreaterThan(baselineResult.summary.indicatedPowerKw);
    expect(perfResult.summary.imepBar).toBeGreaterThan(baselineResult.summary.imepBar);
    expect(perfResult.summary.bmepBar).toBeGreaterThan(baselineResult.summary.bmepBar);

    // Peak cylinder pressure must be higher with performance camshaft
    const pBase = baselineResult.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!;
    const pPerf = perfResult.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!;
    expect(pPerf.max).toBeGreaterThan(pBase.max);

    // Explainability report should include camshaft contribution
    const camContribution = perfResult.explainability.contributions.find((c) => c.category === 'camshaft');
    expect(camContribution).toBeDefined();
    expect(camContribution?.rationale).toContain('Camshaft timing');
  });
});
