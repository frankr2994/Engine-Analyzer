import { z } from 'zod';
import { SimulationError } from './errors.js';
import { deepFreeze } from './immutability.js';
import { CalculationResultV1, SimulationResultV1, ScenarioComparisonResult } from './results.js';
import { PluginManifest } from './models.js';
import { CalibrationDataset } from './calibration-types.js';

export const DiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  level: z.enum(['info', 'warning', 'error']),
  moduleId: z.string().optional(),
  sampleIndex: z.number().optional(),
  angleDegrees: z.number().optional(),
  timestamp: z.string(),
});

export const ModuleIdentitySchema = z.object({
  id: z.string().min(1),
  modelVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
});

export const CrankAngleStateSchema = z.object({
  conventionId: z.string(),
  cycleDegrees: z.number().positive(),
  angleDegrees: z.number(),
  sampleIndex: z.number().nonnegative(),
  normalizedProgress: z.number().min(0).max(1),
});

export const CalculationResultV1Schema = z.object({
  schemaVersion: z.literal('calculation-result/1'),
  module: ModuleIdentitySchema,
  crankAngle: CrankAngleStateSchema.optional(),
  value: z.record(z.string(), z.unknown()),
  diagnostics: z.array(DiagnosticSchema),
});

export const ChannelSeriesSchema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1),
  quantity: z.enum([
    'angle',
    'pressure',
    'volume',
    'temperature',
    'length',
    'velocity',
    'acceleration',
    'force',
    'torque',
    'power',
    'energy',
    'mass',
    'density',
    'mass_flow',
    'work',
    'efficiency',
    'ratio',
    'frequency',
    'specific_fuel_consumption',
  ]),
  unit: z.string().min(1),
  samples: z.array(z.number()),
  min: z.number(),
  max: z.number(),
  mean: z.number(),
});

export const CrankAngleConventionSchema = z.object({
  conventionId: z.string(),
  cycleDegrees: z.union([z.literal(360), z.literal(720)]),
  zeroReference: z.enum(['TDC_FIRING', 'TDC_OVERLAP', 'BDC']),
  direction: z.enum(['CLOCKWISE', 'COUNTER_CLOCKWISE']),
  strokeCount: z.union([z.literal(2), z.literal(4)]),
  endpointIncluded: z.boolean(),
});

export const CrankAngleGridSchema = z.object({
  convention: CrankAngleConventionSchema,
  startAngleDeg: z.number(),
  endAngleDeg: z.number(),
  resolutionDeg: z.number().positive(),
  sampleCount: z.number().positive(),
  samples: z.array(z.number()),
});

export const ProvenanceRecordSchema = z.object({
  simulationTimestamp: z.string(),
  inputFingerprint: z.string().min(1),
  calibrationId: z.string().min(1),
  calibrationVersion: z.string().min(1),
  calibrationContentHash: z.string().min(1),
  participatingModules: z.array(ModuleIdentitySchema),
  orchestratorVersion: z.string().min(1),
  schemaVersion: z.literal('simulation-result/1'),
});

export const ConfidenceAssessmentSchema = z.object({
  overallScore: z.number().min(0).max(1),
  confidenceLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  uncertaintyBandPct: z.number().nonnegative(),
  limitingFactors: z.array(z.string()).optional(),
});

export const ExplainabilityContributionSchema = z.object({
  category: z.string(),
  parameter: z.string(),
  impactPct: z.number(),
  direction: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
  rationale: z.string(),
});

export const ExplainabilityReportSchema = z.object({
  summary: z.string(),
  contributions: z.array(ExplainabilityContributionSchema),
});

export const CamshaftTimingInputSchema = z.object({
  intakeValveOpenDegBtdc: z.number().min(-50).max(120),
  intakeValveCloseDegAbdc: z.number().min(-50).max(120),
  exhaustValveOpenDegBbdc: z.number().min(-50).max(120),
  exhaustValveCloseDegAtdc: z.number().min(-50).max(120),
  intakeLiftMm: z.number().positive().max(30).optional(),
  exhaustLiftMm: z.number().positive().max(30).optional(),
  intakeDurationDeg: z.number().positive().max(400).optional(),
  exhaustDurationDeg: z.number().positive().max(400).optional(),
  lobeSeparationAngleDeg: z.number().positive().max(180).optional(),
});

export const PerformanceSummarySchema = z.object({
  indicatedPowerKw: z.number(),
  brakePowerKw: z.number(),
  indicatedTorqueNm: z.number(),
  brakeTorqueNm: z.number(),
  indicatedWorkJ: z.number(),
  imepBar: z.number(),
  bmepBar: z.number(),
  fmepBar: z.number(),
  indicatedThermalEfficiencyPct: z.number(),
  brakeThermalEfficiencyPct: z.number(),
  mechanicalEfficiencyPct: z.number(),
  fuelMassPerCycleG: z.number(),
  specificFuelConsumptionGBhpKwh: z.number(),
});

export const SimulationResultV1Schema = z.object({
  schemaVersion: z.literal('simulation-result/1'),
  resultId: z.string().min(1),
  status: z.enum(['SUCCESS', 'WARNING', 'FAILED']),
  model: ModuleIdentitySchema,
  provenance: ProvenanceRecordSchema,
  normalizedConfiguration: z.record(z.string(), z.unknown()),
  assumptions: z.array(z.string()),
  confidence: ConfidenceAssessmentSchema,
  explainability: ExplainabilityReportSchema,
  crankAngleGrid: CrankAngleGridSchema,
  channels: z.array(ChannelSeriesSchema),
  summary: PerformanceSummarySchema,
  diagnostics: z.array(DiagnosticSchema),
});

export const MetricDeltaSchema = z.object({
  baselineValue: z.number(),
  modifiedValue: z.number(),
  absoluteDelta: z.number(),
  percentageDelta: z.number(),
  unit: z.string(),
});

export const ChannelDeltaSeriesSchema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1),
  quantity: z.enum([
    'angle',
    'pressure',
    'volume',
    'temperature',
    'length',
    'velocity',
    'acceleration',
    'force',
    'torque',
    'power',
    'energy',
    'mass',
    'density',
    'mass_flow',
    'work',
    'efficiency',
    'ratio',
    'frequency',
    'specific_fuel_consumption',
  ]),
  unit: z.string().min(1),
  deltaSamples: z.array(z.number()),
  maxAbsoluteDelta: z.number().nonnegative(),
});

export const ScenarioComparisonResultSchema = z.object({
  schemaVersion: z.literal('scenario-comparison/1'),
  comparisonId: z.string().min(1),
  timestamp: z.string(),
  baselineResultId: z.string().min(1),
  modifiedResultId: z.string().min(1),
  baselineModelId: z.string().min(1),
  modifiedModelId: z.string().min(1),
  summaryDeltas: z.object({
    indicatedPowerKw: MetricDeltaSchema,
    brakePowerKw: MetricDeltaSchema,
    indicatedTorqueNm: MetricDeltaSchema,
    brakeTorqueNm: MetricDeltaSchema,
    imepBar: MetricDeltaSchema,
    bmepBar: MetricDeltaSchema,
    brakeThermalEfficiencyPct: MetricDeltaSchema,
    specificFuelConsumptionGBhpKwh: MetricDeltaSchema,
    peakPressureBar: MetricDeltaSchema.optional(),
  }),
  channelDeltas: z.array(ChannelDeltaSeriesSchema),
  narrativeSummary: z.string(),
  keyFindings: z.array(z.string()),
});

export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  contractSchemaMajor: z.literal(1),
  capabilities: z.array(z.string()),
  description: z.string(),
  supportedEngineTypes: z.array(z.string()),
});

export const CalibrationParameterSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  description: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const CalibrationTable1DSchema = z.object({
  name: z.string(),
  xUnit: z.string(),
  yUnit: z.string(),
  xValues: z.array(z.number()),
  yValues: z.array(z.number()),
});

export const CalibrationDatasetSchema = z.object({
  schemaVersion: z.literal('calibration-dataset/1'),
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  contentHash: z.string().min(1),
  parameters: z.record(z.string(), CalibrationParameterSchema),
  tables1D: z.record(z.string(), CalibrationTable1DSchema).optional(),
});

/**
 * Validates and freezes a CalculationResultV1 document.
 * Fails closed if the schema version is unknown or fields are invalid.
 */
export function parseCalculationResultV1<T = Record<string, unknown>>(raw: unknown): CalculationResultV1<T> {
  if (typeof raw !== 'object' || raw === null) {
    throw new SimulationError({
      code: 'INVALID_INPUT',
      message: 'Calculation result must be a non-null object',
      actual: raw,
    });
  }

  const rawObj = raw as Record<string, unknown>;
  if (rawObj['schemaVersion'] !== 'calculation-result/1') {
    throw new SimulationError({
      code: 'UNKNOWN_SCHEMA_VERSION',
      message: `Unknown or unsupported calculation result schema version: ${String(rawObj['schemaVersion'])}`,
      expected: 'calculation-result/1',
      actual: rawObj['schemaVersion'],
    });
  }

  const parseResult = CalculationResultV1Schema.safeParse(raw);
  if (!parseResult.success) {
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid calculation result structure: ${parseResult.error.message}`,
      details: { errors: parseResult.error.issues },
    });
  }

  return deepFreeze(parseResult.data as unknown as CalculationResultV1<T>);
}

/**
 * Validates and freezes a SimulationResultV1 document.
 * Fails closed if the schema version is unknown or fields are invalid.
 */
export function parseSimulationResultV1(raw: unknown): SimulationResultV1 {
  if (typeof raw !== 'object' || raw === null) {
    throw new SimulationError({
      code: 'INVALID_INPUT',
      message: 'Simulation result must be a non-null object',
      actual: raw,
    });
  }

  const rawObj = raw as Record<string, unknown>;
  if (rawObj['schemaVersion'] !== 'simulation-result/1') {
    throw new SimulationError({
      code: 'UNKNOWN_SCHEMA_VERSION',
      message: `Unknown or unsupported simulation result schema version: ${String(rawObj['schemaVersion'])}`,
      expected: 'simulation-result/1',
      actual: rawObj['schemaVersion'],
    });
  }

  const parseResult = SimulationResultV1Schema.safeParse(raw);
  if (!parseResult.success) {
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid simulation result structure: ${parseResult.error.message}`,
      details: { errors: parseResult.error.issues },
    });
  }

  // Verify channel invariants: min <= mean <= max and length == crankAngleGrid.sampleCount
  const data = parseResult.data as unknown as SimulationResultV1;
  const expectedSamples = data.crankAngleGrid.sampleCount;
  for (const ch of data.channels) {
    if (ch.samples.length !== expectedSamples) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_ANGLE_GRID',
        message: `Channel '${ch.channelId}' sample count (${ch.samples.length}) does not match grid sample count (${expectedSamples})`,
        expected: expectedSamples,
        actual: ch.samples.length,
      });
    }
    if (ch.min > ch.max + 1e-9) {
      throw new SimulationError({
        code: 'PHYSICAL_INVARIANT_VIOLATION',
        message: `Channel '${ch.channelId}' has invalid min/max bounds: min=${ch.min} > max=${ch.max}`,
      });
    }
  }

  return deepFreeze(data);
}

export function parsePluginManifest(raw: unknown): PluginManifest {
  const parseResult = PluginManifestSchema.safeParse(raw);
  if (!parseResult.success) {
    throw new SimulationError({
      code: 'INCOMPATIBLE_PLUGIN',
      message: `Invalid plugin manifest: ${parseResult.error.message}`,
      details: { errors: parseResult.error.issues },
    });
  }
  return deepFreeze(parseResult.data as PluginManifest);
}

export function parseCalibrationDataset(raw: unknown): CalibrationDataset {
  if (typeof raw !== 'object' || raw === null) {
    throw new SimulationError({
      code: 'INVALID_INPUT',
      message: 'Calibration dataset must be a non-null object',
      actual: raw,
    });
  }
  const rawObj = raw as Record<string, unknown>;
  if (rawObj['schemaVersion'] !== 'calibration-dataset/1') {
    throw new SimulationError({
      code: 'UNKNOWN_SCHEMA_VERSION',
      message: `Unknown calibration schema version: ${String(rawObj['schemaVersion'])}`,
      expected: 'calibration-dataset/1',
      actual: rawObj['schemaVersion'],
    });
  }
  const parseResult = CalibrationDatasetSchema.safeParse(raw);
  if (!parseResult.success) {
    throw new SimulationError({
      code: 'CALIBRATION_CORRUPT',
      message: `Corrupt calibration document: ${parseResult.error.message}`,
      details: { errors: parseResult.error.issues },
    });
  }
  return deepFreeze(parseResult.data as CalibrationDataset);
}

/**
 * Validates and freezes a ScenarioComparisonResult document.
 * Fails closed if the schema version is unknown or fields are invalid.
 */
export function parseScenarioComparisonResult(raw: unknown): ScenarioComparisonResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new SimulationError({
      code: 'INVALID_INPUT',
      message: 'Scenario comparison result must be a non-null object',
      actual: raw,
    });
  }

  const rawObj = raw as Record<string, unknown>;
  if (rawObj['schemaVersion'] !== 'scenario-comparison/1') {
    throw new SimulationError({
      code: 'UNKNOWN_SCHEMA_VERSION',
      message: `Unknown or unsupported scenario comparison schema version: ${String(rawObj['schemaVersion'])}`,
      expected: 'scenario-comparison/1',
      actual: rawObj['schemaVersion'],
    });
  }

  const parseResult = ScenarioComparisonResultSchema.safeParse(raw);
  if (!parseResult.success) {
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid scenario comparison result structure: ${parseResult.error.message}`,
      details: { errors: parseResult.error.issues },
    });
  }

  return deepFreeze(parseResult.data as unknown as ScenarioComparisonResult);
}
