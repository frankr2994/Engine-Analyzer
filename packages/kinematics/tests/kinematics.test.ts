import { describe, it, expect } from 'vitest';
import {
  KinematicsCalculationModule,
  createCrankAngleGrid,
} from '../src/index.js';
import { EngineGeometryInput } from '@engine-analyzer/contracts';

describe('Kinematics Calculation Module', () => {
  const standardEngine: EngineGeometryInput = {
    boreMm: 84.0,
    strokeMm: 90.0,
    connectingRodLengthMm: 145.0,
    compressionRatio: 10.0,
    cylinderCount: 4,
    wristPinOffsetMm: 0.0,
  };

  const module = new KinematicsCalculationModule();

  it('calculates exact TDC and BDC positions and volumes at key angles', () => {
    const grid = createCrankAngleGrid({ resolutionDeg: 1.0 });
    const result = module.calculate({ engine: standardEngine, rpm: 3000, grid });

    expect(result.schemaVersion).toBe('calculation-result/1');
    expect(result.module.id).toBe('module.kinematics.crank-slider');
    expect(Object.isFrozen(result)).toBe(true);

    const posChannel = result.value.channels.find((c) => c.channelId === 'piston_position_mm')!;
    const volChannel = result.value.channels.find((c) => c.channelId === 'cylinder_volume_cm3')!;
    const velChannel = result.value.channels.find((c) => c.channelId === 'piston_velocity_m_s')!;
    const accChannel = result.value.channels.find((c) => c.channelId === 'piston_acceleration_m_s2')!;

    const Vd = result.value.displacementVolumeCm3;
    const Vc = result.value.clearanceVolumeCm3;

    // Expected displacement for 84mm bore x 90mm stroke = pi/4 * 84^2 * 90 / 1000 = 498.759 cm^3
    expect(Vd).toBeCloseTo(498.759, 2);
    // Vc = Vd / (10 - 1) = 55.417 cm^3
    expect(Vc).toBeCloseTo(55.417, 2);

    // TDC at theta = 0 deg
    expect(posChannel.samples[0]).toBeCloseTo(0.0, 4);
    expect(volChannel.samples[0]).toBeCloseTo(Vc, 3);
    expect(velChannel.samples[0]).toBeCloseTo(0.0, 3);
    expect((accChannel.samples[0] ?? 0)).toBeGreaterThan(0.0);

    // BDC at theta = 180 deg
    expect(posChannel.samples[180]).toBeCloseTo(standardEngine.strokeMm, 4);
    expect(volChannel.samples[180]).toBeCloseTo(Vc + Vd, 3);
    expect(velChannel.samples[180]).toBeCloseTo(0.0, 3);
    expect((accChannel.samples[180] ?? 0)).toBeLessThan(0.0);

    // TDC at theta = 360 deg
    expect(posChannel.samples[360]).toBeCloseTo(0.0, 4);
    expect(volChannel.samples[360]).toBeCloseTo(Vc, 3);

    // BDC at theta = 540 deg
    expect(posChannel.samples[540]).toBeCloseTo(standardEngine.strokeMm, 4);
    expect(volChannel.samples[540]).toBeCloseTo(Vc + Vd, 3);
  });

  it('calculates accurate mean and peak piston speeds at 6000 RPM', () => {
    const result = module.calculate({ engine: standardEngine, rpm: 6000 });

    // Mean piston speed = 2 * stroke * (RPM / 60) = 2 * 0.09 * 100 = 18.0 m/s
    expect(result.value.meanPistonSpeedMs).toBeCloseTo(18.0, 3);
    // Max piston speed > mean piston speed
    expect(result.value.maxPistonSpeedMs).toBeGreaterThan(18.0);
    expect(result.value.maxPistonSpeedMs).toBeLessThan(35.0);
  });

  it('throws PHYSICAL_INVARIANT_VIOLATION when rod cannot span crank radius plus wrist-pin offset', () => {
    const invalidEngine: EngineGeometryInput = {
      boreMm: 84.0,
      strokeMm: 100.0, // r = 50
      connectingRodLengthMm: 60.0, // l = 60
      compressionRatio: 10.0,
      cylinderCount: 4,
      wristPinOffsetMm: 15.0, // r + offset = 65 > 60
    };

    expect(() => module.calculate({ engine: invalidEngine, rpm: 3000 })).toThrowError(/PHYSICAL_INVARIANT_VIOLATION/);
  });

  it('calculates kinematics accurately with valid non-zero wrist-pin offset', () => {
    const offsetEngine: EngineGeometryInput = {
      ...standardEngine,
      wristPinOffsetMm: 5.0,
    };
    const grid = createCrankAngleGrid({ resolutionDeg: 1.0 });
    const result = module.calculate({ engine: offsetEngine, rpm: 3000, grid });

    expect(result.schemaVersion).toBe('calculation-result/1');
    const posChannel = result.value.channels.find((c) => c.channelId === 'piston_position_mm')!;
    const volChannel = result.value.channels.find((c) => c.channelId === 'cylinder_volume_cm3')!;

    // For offset = 5mm, TDC occurs at theta = asin(5 / (45 + 145)) ~ 1.5 deg. At theta = 0, position is ~0.02 mm
    expect(posChannel.samples[0]).toBeCloseTo(0.02, 2);
    expect(volChannel.samples[0]).toBeGreaterThan(0.0);
    expect(posChannel.samples.every((s) => Number.isFinite(s))).toBe(true);
    expect(volChannel.samples.every((s) => Number.isFinite(s))).toBe(true);
  });
});
