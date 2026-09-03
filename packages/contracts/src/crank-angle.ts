/**
 * Authoritative Crank Angle definitions and sampling grid types.
 */

export interface CrankAngleConvention {
  /** Unique identifier for convention, e.g. 'TDC_FIRING_0_720' or 'TDC_0_360' */
  readonly conventionId: string;
  /** Full cycle range in degrees (e.g., 720 for 4-stroke, 360 for 2-stroke) */
  readonly cycleDegrees: 360 | 720;
  /** Zero reference point */
  readonly zeroReference: 'TDC_FIRING' | 'TDC_OVERLAP' | 'BDC';
  /** Direction of rotation */
  readonly direction: 'CLOCKWISE' | 'COUNTER_CLOCKWISE';
  /** Number of strokes per cycle */
  readonly strokeCount: 2 | 4;
  /** Whether the endpoint (e.g. 720) is included or wrapped [0, cycleDegrees) */
  readonly endpointIncluded: boolean;
}

export const FOUR_STROKE_TDC_CONVENTION: Readonly<CrankAngleConvention> = Object.freeze({
  conventionId: 'FOUR_STROKE_TDC_FIRING_0_720',
  cycleDegrees: 720,
  zeroReference: 'TDC_FIRING',
  direction: 'CLOCKWISE',
  strokeCount: 4,
  endpointIncluded: false,
});

export const TWO_STROKE_TDC_CONVENTION: Readonly<CrankAngleConvention> = Object.freeze({
  conventionId: 'TWO_STROKE_TDC_0_360',
  cycleDegrees: 360,
  zeroReference: 'TDC_FIRING',
  direction: 'CLOCKWISE',
  strokeCount: 2,
  endpointIncluded: false,
});

export interface CrankAngleState {
  readonly conventionId: string;
  readonly cycleDegrees: number;
  readonly angleDegrees: number;
  readonly sampleIndex: number;
  readonly normalizedProgress: number; // 0.0 to 1.0
}

export interface CrankAngleGrid {
  readonly convention: CrankAngleConvention;
  readonly startAngleDeg: number;
  readonly endAngleDeg: number;
  readonly resolutionDeg: number;
  readonly sampleCount: number;
  readonly samples: readonly number[];
}
