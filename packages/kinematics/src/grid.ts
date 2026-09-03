import {
  CrankAngleConvention,
  CrankAngleGrid,
  FOUR_STROKE_TDC_CONVENTION,
  TWO_STROKE_TDC_CONVENTION,
  SimulationError,
  deepFreeze,
} from '@engine-analyzer/contracts';

export interface GridOptions {
  convention?: CrankAngleConvention;
  startAngleDeg?: number;
  endAngleDeg?: number;
  resolutionDeg?: number;
}

export function createCrankAngleGrid(options: GridOptions = {}): CrankAngleGrid {
  const convention = options.convention ?? FOUR_STROKE_TDC_CONVENTION;
  const startAngleDeg = options.startAngleDeg ?? 0;
  const endAngleDeg = options.endAngleDeg ?? convention.cycleDegrees;
  const resolutionDeg = options.resolutionDeg ?? 1.0;

  if (resolutionDeg <= 0 || resolutionDeg > convention.cycleDegrees) {
    throw new SimulationError({
      code: 'INCOMPATIBLE_ANGLE_GRID',
      message: `Invalid grid resolution: ${resolutionDeg}. Must be positive and <= ${convention.cycleDegrees}.`,
      expected: `0 < resolution <= ${convention.cycleDegrees}`,
      actual: resolutionDeg,
    });
  }

  if (startAngleDeg >= endAngleDeg) {
    throw new SimulationError({
      code: 'INCOMPATIBLE_ANGLE_GRID',
      message: `Grid start angle (${startAngleDeg}) must be strictly less than end angle (${endAngleDeg}).`,
      expected: `start < end`,
      actual: { startAngleDeg, endAngleDeg },
    });
  }

  const samples: number[] = [];
  const epsilon = 1e-7;

  // Generate discrete monotonic samples
  if (convention.endpointIncluded) {
    for (let angle = startAngleDeg; angle <= endAngleDeg + epsilon; angle += resolutionDeg) {
      samples.push(Math.round(angle * 1e6) / 1e6);
    }
  } else {
    for (let angle = startAngleDeg; angle < endAngleDeg - epsilon; angle += resolutionDeg) {
      samples.push(Math.round(angle * 1e6) / 1e6);
    }
  }

  if (samples.length === 0) {
    throw new SimulationError({
      code: 'INCOMPATIBLE_ANGLE_GRID',
      message: 'Generated grid has 0 samples.',
    });
  }

  // Verify strict monotonicity
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] ?? 0) <= (samples[i - 1] ?? 0)) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_ANGLE_GRID',
        message: `Grid samples are not strictly monotonic at index ${i}`,
      });
    }
  }

  return deepFreeze({
    convention,
    startAngleDeg,
    endAngleDeg,
    resolutionDeg,
    sampleCount: samples.length,
    samples,
  });
}
