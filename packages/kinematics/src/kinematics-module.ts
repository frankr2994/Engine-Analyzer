import {
  CalculationModule,
  CalculationResultV1,
  ChannelSeries,
  CrankAngleGrid,
  EngineGeometryInput,
  SimulationError,
  deepFreeze,
} from '@engine-analyzer/contracts';
import { createCrankAngleGrid } from './grid.js';

export interface KinematicsInput {
  readonly engine: EngineGeometryInput;
  readonly rpm: number;
  readonly grid?: CrankAngleGrid;
}

export interface KinematicsOutput {
  readonly displacementVolumeCm3: number;
  readonly clearanceVolumeCm3: number;
  readonly totalVolumeCm3: number;
  readonly meanPistonSpeedMs: number;
  readonly maxPistonSpeedMs: number;
  readonly maxPistonAccelerationMs2: number;
  readonly channels: readonly ChannelSeries[];
}

export class KinematicsCalculationModule implements CalculationModule<KinematicsInput, KinematicsOutput> {
  public readonly id = 'module.kinematics.crank-slider';
  public readonly modelVersion = '1.0.0';
  public readonly schemaVersion = 'calculation-result/1';

  public calculate(input: KinematicsInput): CalculationResultV1<KinematicsOutput> {
    const { engine, rpm } = input;
    const grid = input.grid ?? createCrankAngleGrid();

    const boreMm = engine.boreMm;
    const strokeMm = engine.strokeMm;
    const rodLengthMm = engine.connectingRodLengthMm;
    const cr = engine.compressionRatio;
    const offsetMm = engine.wristPinOffsetMm ?? 0;

    const r = strokeMm / 2.0; // Crank radius in mm
    const l = rodLengthMm;
    const lambda = r / l;

    if (!Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(offsetMm)) {
      throw new SimulationError({
        code: 'PHYSICAL_INVARIANT_VIOLATION',
        message: 'Non-finite kinematic dimensions encountered',
        details: { rodLengthMm: l, crankRadiusMm: r, offsetMm },
      });
    }

    if (l <= r + Math.abs(offsetMm)) {
      throw new SimulationError({
        code: 'PHYSICAL_INVARIANT_VIOLATION',
        message: `Connecting rod length (${rodLengthMm}mm) must be strictly greater than crank radius + |offset| (${r + Math.abs(offsetMm)}mm)`,
        expected: `l > r + |offset|`,
        actual: { rodLengthMm: l, crankRadiusMm: r, offsetMm },
        details: {
          angleDeg: 0,
          offsetMm,
          rodLengthMm: l,
          crankRadiusMm: r,
          invalidRadicand: l * l - Math.pow(r + Math.abs(offsetMm), 2),
        },
      });
    }

    const omega = 2.0 * Math.PI * (rpm / 60.0); // Angular velocity in rad/s
    const pistonAreaMm2 = (Math.PI / 4.0) * boreMm * boreMm;
    const displacementVolumeCm3 = pistonAreaMm2 * strokeMm * 1e-3;
    const clearanceVolumeCm3 = displacementVolumeCm3 / (cr - 1.0);
    const totalVolumeCm3 = clearanceVolumeCm3 + displacementVolumeCm3;
    const meanPistonSpeedMs = 2.0 * (strokeMm * 1e-3) * (rpm / 60.0);

    const positionSamples: number[] = [];
    const volumeSamples: number[] = [];
    const velocitySamples: number[] = [];
    const accelerationSamples: number[] = [];
    const rodAngleSamples: number[] = [];

    // Reference x at TDC if offset != 0
    let xTdc: number;
    if (Math.abs(offsetMm) < 1e-6) {
      xTdc = r + l;
    } else {
      const asinTdcArg = offsetMm / (r + l);
      if (Math.abs(asinTdcArg) > 1.0 || !Number.isFinite(asinTdcArg)) {
        throw new SimulationError({
          code: 'PHYSICAL_INVARIANT_VIOLATION',
          message: `Invalid TDC angle calculation: asin argument (${asinTdcArg}) out of bounds`,
          details: { angleDeg: 0, offsetMm, rodLengthMm: l, crankRadiusMm: r, asinArg: asinTdcArg },
        });
      }
      const thetaTdc = Math.asin(asinTdcArg);
      const tdcY = r * Math.sin(thetaTdc) - offsetMm;
      const tdcRadicand = l * l - tdcY * tdcY;
      if (tdcRadicand <= 0 || !Number.isFinite(tdcRadicand)) {
        throw new SimulationError({
          code: 'PHYSICAL_INVARIANT_VIOLATION',
          message: `Invalid TDC position calculation: radicand (${tdcRadicand}) <= 0`,
          details: { angleDeg: 0, offsetMm, rodLengthMm: l, crankRadiusMm: r, invalidRadicand: tdcRadicand },
        });
      }
      xTdc = r * Math.cos(thetaTdc) + Math.sqrt(tdcRadicand);
    }

    for (const thetaDeg of grid.samples) {
      if (!Number.isFinite(thetaDeg)) {
        throw new SimulationError({
          code: 'PHYSICAL_INVARIANT_VIOLATION',
          message: `Encountered non-finite crank angle sample: ${thetaDeg}`,
          details: { angleDeg: thetaDeg, offsetMm, rodLengthMm: l, crankRadiusMm: r },
        });
      }
      const thetaRad = (thetaDeg * Math.PI) / 180.0;
      let s: number; // mm
      let v: number; // m/s
      let a: number; // m/s^2
      let betaDeg: number; // deg

      if (Math.abs(offsetMm) < 1e-6) {
        // Standard in-line slider-crank
        const cosT = Math.cos(thetaRad);
        const sinT = Math.sin(thetaRad);
        const sin2T = Math.sin(2.0 * thetaRad);
        const cos2T = Math.cos(2.0 * thetaRad);
        const radicand = 1.0 - lambda * lambda * sinT * sinT;
        if (radicand <= 0 || !Number.isFinite(radicand)) {
          throw new SimulationError({
            code: 'PHYSICAL_INVARIANT_VIOLATION',
            message: `Kinematic invariant violation: radicand (${radicand}) <= 0 at angle ${thetaDeg} deg`,
            details: {
              angleDeg: thetaDeg,
              offsetMm,
              rodLengthMm: l,
              crankRadiusMm: r,
              invalidRadicand: radicand,
            },
          });
        }
        const rootTerm = Math.sqrt(radicand);
        if (rootTerm < 1e-9) {
          throw new SimulationError({
            code: 'PHYSICAL_INVARIANT_VIOLATION',
            message: `Kinematic invariant violation: rootTerm denominator near zero (${rootTerm}) at angle ${thetaDeg} deg`,
            details: {
              angleDeg: thetaDeg,
              offsetMm,
              rodLengthMm: l,
              crankRadiusMm: r,
              rootTerm,
            },
          });
        }
        const asinArg = lambda * sinT;
        if (Math.abs(asinArg) > 1.0 || !Number.isFinite(asinArg)) {
          throw new SimulationError({
            code: 'PHYSICAL_INVARIANT_VIOLATION',
            message: `Kinematic invariant violation: asin argument (${asinArg}) out of bounds [-1, 1] at angle ${thetaDeg} deg`,
            details: {
              angleDeg: thetaDeg,
              offsetMm,
              rodLengthMm: l,
              crankRadiusMm: r,
              asinArg,
            },
          });
        }

        s = r * (1.0 - cosT) + l * (1.0 - rootTerm);
        v = (r * 1e-3) * omega * (sinT + (lambda * sin2T) / (2.0 * rootTerm));
        const aNum = lambda * cos2T + Math.pow(lambda, 3) * Math.pow(sinT, 4);
        const aDenom = Math.pow(rootTerm, 3);
        a = (r * 1e-3) * omega * omega * (cosT + aNum / aDenom);
        betaDeg = (Math.asin(asinArg) * 180.0) / Math.PI;
      } else {
        // Offset slider-crank
        const sinT = Math.sin(thetaRad);
        const cosT = Math.cos(thetaRad);
        const yPiston = r * sinT - offsetMm;
        const radicand = l * l - yPiston * yPiston;
        if (radicand <= 0 || !Number.isFinite(radicand)) {
          throw new SimulationError({
            code: 'PHYSICAL_INVARIANT_VIOLATION',
            message: `Kinematic invariant violation: radicand (${radicand}) <= 0 at angle ${thetaDeg} deg`,
            details: {
              angleDeg: thetaDeg,
              offsetMm,
              rodLengthMm: l,
              crankRadiusMm: r,
              invalidRadicand: radicand,
            },
          });
        }
        const rootTerm = Math.sqrt(radicand);
        if (rootTerm < 1e-9) {
          throw new SimulationError({
            code: 'PHYSICAL_INVARIANT_VIOLATION',
            message: `Kinematic invariant violation: denominator rootTerm near zero (${rootTerm}) at angle ${thetaDeg} deg`,
            details: {
              angleDeg: thetaDeg,
              offsetMm,
              rodLengthMm: l,
              crankRadiusMm: r,
              rootTerm,
            },
          });
        }
        const xPos = r * cosT + rootTerm;
        s = xTdc - xPos;

        const dRootTerm = (-yPiston * r * cosT) / rootTerm;
        const dxDtheta = -r * sinT + dRootTerm;
        v = -dxDtheta * omega * 1e-3;

        const d2RootTerm =
          (-r * (cosT * cosT * r - yPiston * sinT) * rootTerm - yPiston * r * cosT * dRootTerm) / (rootTerm * rootTerm);
        const d2xDtheta2 = -r * cosT + d2RootTerm;
        a = -d2xDtheta2 * omega * omega * 1e-3;

        const asinArg = yPiston / l;
        if (Math.abs(asinArg) > 1.0 || !Number.isFinite(asinArg)) {
          throw new SimulationError({
            code: 'PHYSICAL_INVARIANT_VIOLATION',
            message: `Kinematic invariant violation: asin argument (${asinArg}) out of bounds [-1, 1] at angle ${thetaDeg} deg`,
            details: {
              angleDeg: thetaDeg,
              offsetMm,
              rodLengthMm: l,
              crankRadiusMm: r,
              asinArg,
            },
          });
        }
        betaDeg = (Math.asin(asinArg) * 180.0) / Math.PI;
      }

      const volumeCm3 = clearanceVolumeCm3 + pistonAreaMm2 * s * 1e-3;

      if (!Number.isFinite(s) || !Number.isFinite(volumeCm3) || !Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(betaDeg)) {
        throw new SimulationError({
          code: 'PHYSICAL_INVARIANT_VIOLATION',
          message: `Kinematic calculation produced non-finite values at angle ${thetaDeg} deg`,
          details: { angleDeg: thetaDeg, offsetMm, rodLengthMm: l, crankRadiusMm: r, s, volumeCm3, v, a, betaDeg },
        });
      }

      positionSamples.push(s);
      volumeSamples.push(volumeCm3);
      velocitySamples.push(v);
      accelerationSamples.push(a);
      rodAngleSamples.push(betaDeg);
    }

    const calcStats = (samples: number[]) => {
      if (!samples || samples.length === 0) {
        throw new SimulationError({
          code: 'INVALID_INPUT',
          message: 'Cannot compute statistics for empty samples array',
        });
      }
      let min = samples[0]!;
      let max = samples[0]!;
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const val = samples[i]!;
        if (!Number.isFinite(val)) {
          throw new SimulationError({
            code: 'PHYSICAL_INVARIANT_VIOLATION',
            message: `Non-finite sample at index ${i}: ${val}`,
          });
        }
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
      }
      return { min, max, mean: sum / samples.length };
    };

    const posStats = calcStats(positionSamples);
    const volStats = calcStats(volumeSamples);
    const velStats = calcStats(velocitySamples);
    const accStats = calcStats(accelerationSamples);
    const rodStats = calcStats(rodAngleSamples);

    const channels: ChannelSeries[] = [
      {
        channelId: 'piston_position_mm',
        name: 'Piston Position',
        quantity: 'length',
        unit: 'mm',
        samples: positionSamples,
        min: posStats.min,
        max: posStats.max,
        mean: posStats.mean,
      },
      {
        channelId: 'cylinder_volume_cm3',
        name: 'Cylinder Volume',
        quantity: 'volume',
        unit: 'cm3',
        samples: volumeSamples,
        min: volStats.min,
        max: volStats.max,
        mean: volStats.mean,
      },
      {
        channelId: 'piston_velocity_m_s',
        name: 'Piston Velocity',
        quantity: 'velocity',
        unit: 'm/s',
        samples: velocitySamples,
        min: velStats.min,
        max: velStats.max,
        mean: velStats.mean,
      },
      {
        channelId: 'piston_acceleration_m_s2',
        name: 'Piston Acceleration',
        quantity: 'acceleration',
        unit: 'm/s2',
        samples: accelerationSamples,
        min: accStats.min,
        max: accStats.max,
        mean: accStats.mean,
      },
      {
        channelId: 'connecting_rod_angle_deg',
        name: 'Connecting Rod Angle',
        quantity: 'angle',
        unit: 'deg',
        samples: rodAngleSamples,
        min: rodStats.min,
        max: rodStats.max,
        mean: rodStats.mean,
      },
    ];

    let maxSpeed = 0;
    for (const v of velocitySamples) {
      if (Math.abs(v) > maxSpeed) maxSpeed = Math.abs(v);
    }

    let maxAcc = 0;
    for (const a of accelerationSamples) {
      if (Math.abs(a) > maxAcc) maxAcc = Math.abs(a);
    }

    return deepFreeze({
      schemaVersion: 'calculation-result/1',
      module: {
        id: this.id,
        modelVersion: this.modelVersion,
        schemaVersion: this.schemaVersion,
      },
      value: {
        displacementVolumeCm3,
        clearanceVolumeCm3,
        totalVolumeCm3,
        meanPistonSpeedMs,
        maxPistonSpeedMs: maxSpeed,
        maxPistonAccelerationMs2: maxAcc,
        channels,
      },
      diagnostics: [
        {
          code: 'INFO_KINEMATICS_CALCULATED',
          message: `Calculated kinematics for ${grid.sampleCount} angle samples.`,
          level: 'info',
          moduleId: this.id,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }
}
