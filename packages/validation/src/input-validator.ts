import { z } from 'zod';
import * as crypto from 'node:crypto';
import {
  EngineGeometryInput,
  OperatingConditionsInput,
  SimulationModelInput,
  SimulationError,
  deepFreeze,
} from '@engine-analyzer/contracts';

export const CamshaftTimingInputSchema = z.object({
  intakeValveOpenDegBtdc: z.number().min(-50, 'IVO must be >= -50 deg').max(120, 'IVO must be <= 120 deg'),
  intakeValveCloseDegAbdc: z.number().min(-50, 'IVC must be >= -50 deg').max(120, 'IVC must be <= 120 deg'),
  exhaustValveOpenDegBbdc: z.number().min(-50, 'EVO must be >= -50 deg').max(120, 'EVO must be <= 120 deg'),
  exhaustValveCloseDegAtdc: z.number().min(-50, 'EVC must be >= -50 deg').max(120, 'EVC must be <= 120 deg'),
  intakeLiftMm: z.number().positive('Intake lift must be positive').max(30).optional(),
  exhaustLiftMm: z.number().positive('Exhaust lift must be positive').max(30).optional(),
  intakeDurationDeg: z.number().positive('Intake duration must be positive').max(400).optional(),
  exhaustDurationDeg: z.number().positive('Exhaust duration must be positive').max(400).optional(),
  lobeSeparationAngleDeg: z.number().positive('LSA must be positive').max(180).optional(),
});

export const EngineGeometryInputSchema = z.object({
  boreMm: z.number().min(20, 'Bore must be at least 20mm').max(500, 'Bore must not exceed 500mm'),
  strokeMm: z.number().min(20, 'Stroke must be at least 20mm').max(600, 'Stroke must not exceed 600mm'),
  connectingRodLengthMm: z.number().min(40, 'Connecting rod length must be at least 40mm').max(1200, 'Connecting rod length must not exceed 1200mm'),
  compressionRatio: z.number().min(4.0, 'Compression ratio must be at least 4.0').max(30.0, 'Compression ratio must not exceed 30.0'),
  cylinderCount: z.number().int('Cylinder count must be an integer').min(1, 'Cylinder count must be at least 1').max(24, 'Cylinder count must not exceed 24'),
  wristPinOffsetMm: z.number().min(-20).max(20).optional().default(0),
  camshaft: CamshaftTimingInputSchema.optional(),
}).refine((data) => data.connectingRodLengthMm > data.strokeMm / 2, {
  message: 'Connecting rod length must be greater than half stroke (crank radius)',
  path: ['connectingRodLengthMm'],
});

export const OperatingConditionsInputSchema = z.object({
  rpm: z.number().min(100, 'RPM must be at least 100').max(25000, 'RPM must not exceed 25000'),
  intakePressureBar: z.number().min(0.1, 'Intake pressure must be at least 0.1 bar').max(10.0, 'Intake pressure must not exceed 10.0 bar'),
  intakeTemperatureK: z.number().min(200, 'Intake temperature must be at least 200 K').max(500, 'Intake temperature must not exceed 500 K'),
  sparkTimingDegBtdc: z.number().min(-30, 'Spark timing must be >= -30 deg BTDC').max(70, 'Spark timing must be <= 70 deg BTDC'),
  airFuelRatio: z.number().min(6.0, 'AFR must be at least 6.0:1').max(35.0, 'AFR must not exceed 35.0:1'),
  combustionDurationDeg: z.number().min(5.0, 'Combustion duration must be >= 5 deg').max(120.0, 'Combustion duration must be <= 120 deg').optional().default(45.0),
});

export const SimulationModelInputSchema = z.object({
  engine: EngineGeometryInputSchema,
  operating: OperatingConditionsInputSchema,
  calibrationId: z.string().min(1, 'Calibration ID is required'),
  calibrationVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Calibration version must be valid semver (e.g. 1.0.0)'),
  resolutionDeg: z.number().min(0.1, 'Angle resolution must be >= 0.1 deg').max(10.0, 'Angle resolution must be <= 10.0 deg').optional().default(1.0),
});

export function validateEngineGeometry(raw: unknown): EngineGeometryInput {
  const result = EngineGeometryInputSchema.safeParse(raw);
  if (!result.success) {
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid engine geometry: ${result.error.issues.map((i) => i.message).join('; ')}`,
      details: { errors: result.error.issues },
    });
  }
  return deepFreeze(result.data);
}

export function validateOperatingConditions(raw: unknown): OperatingConditionsInput {
  const result = OperatingConditionsInputSchema.safeParse(raw);
  if (!result.success) {
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid operating conditions: ${result.error.issues.map((i) => i.message).join('; ')}`,
      details: { errors: result.error.issues },
    });
  }
  return deepFreeze(result.data);
}

export function validateSimulationModelInput(raw: unknown): SimulationModelInput {
  const result = SimulationModelInputSchema.safeParse(raw);
  if (!result.success) {
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid simulation input: ${result.error.issues.map((i) => i.message).join('; ')}`,
      details: { errors: result.error.issues },
    });
  }
  return deepFreeze(result.data);
}

/**
 * Deterministically serializes any value into canonical JSON with recursively sorted keys.
 */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((obj as Record<string, unknown>)[key])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Calculates deterministic SHA-256 fingerprint for validated simulation inputs using recursive canonical JSON.
 */
export function computeInputFingerprint(input: SimulationModelInput): string {
  const normalized = canonicalJson(input);
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}
