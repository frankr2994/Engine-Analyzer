/**
 * Stable simulation error codes and structured error representations.
 */

export type SimulationErrorCode =
  | 'UNKNOWN_SCHEMA_VERSION'
  | 'INVALID_INPUT'
  | 'VALIDATION_FAILED'
  | 'CALIBRATION_NOT_FOUND'
  | 'CALIBRATION_VERSION_MISMATCH'
  | 'CALIBRATION_CORRUPT'
  | 'DUPLICATE_CHANNEL'
  | 'INCOMPATIBLE_ANGLE_GRID'
  | 'MODEL_NOT_FOUND'
  | 'INCOMPATIBLE_PLUGIN'
  | 'CALCULATION_NON_CONVERGENCE'
  | 'PHYSICAL_INVARIANT_VIOLATION'
  | 'MUTATION_ATTEMPTED'
  | 'ILLEGAL_DEPENDENCY'
  | 'CHANNEL_NOT_FOUND'
  | 'UNKNOWN_ERROR';

export interface SimulationErrorDetails {
  readonly code: SimulationErrorCode;
  readonly message: string;
  readonly target?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly details?: Record<string, unknown>;
  readonly timestamp: string;
}

export class SimulationError extends Error {
  public readonly code: SimulationErrorCode;
  public readonly target?: string;
  public readonly expected?: unknown;
  public readonly actual?: unknown;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(options: {
    code: SimulationErrorCode;
    message: string;
    target?: string;
    expected?: unknown;
    actual?: unknown;
    details?: Record<string, unknown>;
  }) {
    super(`[${options.code}] ${options.message}`);
    this.name = 'SimulationError';
    this.code = options.code;
    this.target = options.target;
    this.expected = options.expected;
    this.actual = options.actual;
    this.details = options.details ? Object.freeze({ ...options.details }) : undefined;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, SimulationError.prototype);
  }

  public toJSON(): SimulationErrorDetails {
    return Object.freeze({
      code: this.code,
      message: this.message,
      target: this.target,
      expected: this.expected,
      actual: this.actual,
      details: this.details,
      timestamp: this.timestamp,
    });
  }
}
