import { z } from 'zod';
import { SimulationError } from './errors.js';
import { deepFreeze } from './immutability.js';
import {
  CalculationResultV1,
  SimulationResultV1,
  ScenarioComparisonResult,
} from './results.js';
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

export const CrankAngleGridSchema = z
  .object({
    convention: CrankAngleConventionSchema,
    startAngleDeg: z.number(),
    endAngleDeg: z.number(),
    resolutionDeg: z.number().positive(),
    sampleCount: z.number().positive(),
    samples: z.array(z.number()),
  })
  .superRefine((grid, ctx) => {
    if (!Number.isInteger(grid.sampleCount) || grid.sampleCount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grid sampleCount must be a positive integer, got ${grid.sampleCount}`,
        path: ['sampleCount'],
      });
    }

    if (grid.samples.length !== grid.sampleCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grid sampleCount (${grid.sampleCount}) does not match samples.length (${grid.samples.length})`,
        path: ['sampleCount'],
      });
    }

    if (grid.startAngleDeg >= grid.endAngleDeg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grid startAngleDeg (${grid.startAngleDeg}) must be strictly less than endAngleDeg (${grid.endAngleDeg})`,
        path: ['startAngleDeg'],
      });
    }

    let allFinite = true;
    for (let i = 0; i < grid.samples.length; i++) {
      const s = grid.samples[i]!;
      if (!Number.isFinite(s)) {
        allFinite = false;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Grid sample at index ${i} is not a finite number: ${s}`,
          path: ['samples', i],
        });
      }
    }

    if (allFinite && grid.samples.length > 0) {
      // Monotonicity check
      for (let i = 1; i < grid.samples.length; i++) {
        const prev = grid.samples[i - 1]!;
        const curr = grid.samples[i]!;
        if (curr <= prev) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Grid samples must be strictly monotonic: samples[${i - 1}]=${prev} >= samples[${i}]=${curr}`,
            path: ['samples', i],
          });
        }
      }

      // Bounds check
      const first = grid.samples[0]!;
      const last = grid.samples[grid.samples.length - 1]!;
      if (first < grid.startAngleDeg - 1e-4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `First sample (${first}) is before startAngleDeg (${grid.startAngleDeg})`,
          path: ['samples', 0],
        });
      }
      if (last > grid.endAngleDeg + 1e-4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Last sample (${last}) exceeds endAngleDeg (${grid.endAngleDeg})`,
          path: ['samples', grid.samples.length - 1],
        });
      }
    }
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

export const NormalizedConfigurationSchema = z.object({
  engine: z.object({
    boreMm: z.number().positive(),
    strokeMm: z.number().positive(),
    connectingRodLengthMm: z.number().positive(),
    compressionRatio: z.number().positive(),
    cylinderCount: z.number().int().positive(),
    wristPinOffsetMm: z.number().optional(),
    camshaft: CamshaftTimingInputSchema.optional(),
  }),
  operating: z.object({
    rpm: z.number().positive(),
    intakePressureBar: z.number().positive(),
    intakeTemperatureK: z.number().positive(),
    sparkTimingDegBtdc: z.number(),
    airFuelRatio: z.number().positive(),
    combustionDurationDeg: z.number().positive().optional(),
  }),
  calibrationId: z.string(),
  calibrationVersion: z.string(),
  resolutionDeg: z.number().positive().optional(),
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

export const SimulationResultV1Schema = z
  .object({
    schemaVersion: z.literal('simulation-result/1'),
    resultId: z.string().optional(),
    status: z.enum(['SUCCESS', 'WARNING', 'FAILED']),
    model: ModuleIdentitySchema,
    provenance: ProvenanceRecordSchema,
    normalizedConfiguration: NormalizedConfigurationSchema.optional(),
    assumptions: z.array(z.string()).optional(),
    confidence: ConfidenceAssessmentSchema.optional(),
    explainability: ExplainabilityReportSchema.optional(),
    crankAngleGrid: CrankAngleGridSchema,
    channels: z.array(ChannelSeriesSchema),
    summary: PerformanceSummarySchema,
    diagnostics: z.array(DiagnosticSchema),
  })
  .superRefine((data, ctx) => {
    const expectedSamples = data.crankAngleGrid?.sampleCount;
    if (expectedSamples === undefined || !Array.isArray(data.channels)) {
      return;
    }

    const tol = 1e-6;

    for (let cIdx = 0; cIdx < data.channels.length; cIdx++) {
      const ch = data.channels[cIdx]!;
      if (!ch || !Array.isArray(ch.samples)) continue;

      if (ch.samples.length !== expectedSamples) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['channels', cIdx, 'samples'],
          message: `[INCOMPATIBLE_ANGLE_GRID] Channel '${ch.channelId}' sample count (${ch.samples.length}) does not match grid sample count (${expectedSamples})`,
        });
        continue;
      }

      let actualMin = Infinity;
      let actualMax = -Infinity;
      let sum = 0;

      for (let i = 0; i < ch.samples.length; i++) {
        const s = ch.samples[i]!;
        if (!Number.isFinite(s)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['channels', cIdx, 'samples', i],
            message: `[PHYSICAL_INVARIANT_VIOLATION] Channel '${ch.channelId}' sample at index ${i} is not finite: ${s}`,
          });
          return;
        }
        if (s < actualMin) actualMin = s;
        if (s > actualMax) actualMax = s;
        sum += s;
      }

      const actualMean = ch.samples.length > 0 ? sum / ch.samples.length : 0;

      if (Math.abs(ch.min - actualMin) > tol) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['channels', cIdx, 'min'],
          message: `[PHYSICAL_INVARIANT_VIOLATION] Channel '${ch.channelId}' declared min (${ch.min}) does not match actual minimum (${actualMin})`,
        });
      }

      if (Math.abs(ch.max - actualMax) > tol) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['channels', cIdx, 'max'],
          message: `[PHYSICAL_INVARIANT_VIOLATION] Channel '${ch.channelId}' declared max (${ch.max}) does not match actual maximum (${actualMax})`,
        });
      }

      if (Math.abs(ch.mean - actualMean) > tol) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['channels', cIdx, 'mean'],
          message: `[PHYSICAL_INVARIANT_VIOLATION] Channel '${ch.channelId}' declared mean (${ch.mean}) does not match actual mean (${actualMean})`,
        });
      }

      if (ch.min > ch.max + 1e-6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['channels', cIdx, 'min'],
          message: `[PHYSICAL_INVARIANT_VIOLATION] Channel '${ch.channelId}' has invalid min/max bounds: min=${ch.min} > max=${ch.max}`,
        });
      }

      if (ch.min > ch.mean + 1e-6 || ch.mean > ch.max + 1e-6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['channels', cIdx, 'mean'],
          message: `[PHYSICAL_INVARIANT_VIOLATION] Channel '${ch.channelId}' mean (${ch.mean}) is out of [min, max] bounds [${ch.min}, ${ch.max}]`,
        });
      }
    }
  });

export const MetricDeltaSchema = z.object({
  baselineValue: z.number(),
  modifiedValue: z.number(),
  absoluteDelta: z.number(),
  percentageDelta: z.number(),
  unit: z.string(),
});

export const ChannelDeltaSeriesSchema = z.object({
  channelId: z.string(),
  name: z.string(),
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
  unit: z.string(),
  deltaSamples: z.array(z.number()),
  maxAbsoluteDelta: z.number(),
});

export const ScenarioComparisonResultSchema = z.object({
  schemaVersion: z.literal('scenario-comparison/1'),
  comparisonId: z.string(),
  timestamp: z.string(),
  baselineResultId: z.string(),
  modifiedResultId: z.string(),
  baselineModelId: z.string(),
  modifiedModelId: z.string(),
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

export const CalibrationParameterSchema = z
  .object({
    name: z.string(),
    value: z.number(),
    unit: z.string(),
    description: z.string(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .superRefine((val, ctx) => {
    if (!Number.isFinite(val.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Calibration parameter '${val.name}' value must be finite, got ${val.value}`,
        path: ['value'],
      });
    }
    if (val.min !== undefined && !Number.isFinite(val.min)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Calibration parameter '${val.name}' min must be finite, got ${val.min}`,
        path: ['min'],
      });
    }
    if (val.max !== undefined && !Number.isFinite(val.max)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Calibration parameter '${val.name}' max must be finite, got ${val.max}`,
        path: ['max'],
      });
    }
    if (val.min !== undefined && val.max !== undefined && Number.isFinite(val.min) && Number.isFinite(val.max)) {
      if (val.min > val.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Calibration parameter '${val.name}' min (${val.min}) cannot be greater than max (${val.max})`,
          path: ['min'],
        });
      }
    }
    if (val.min !== undefined && Number.isFinite(val.min) && Number.isFinite(val.value)) {
      if (val.value < val.min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Calibration parameter '${val.name}' value (${val.value}) is less than min (${val.min})`,
          path: ['value'],
        });
      }
    }
    if (val.max !== undefined && Number.isFinite(val.max) && Number.isFinite(val.value)) {
      if (val.value > val.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Calibration parameter '${val.name}' value (${val.value}) is greater than max (${val.max})`,
          path: ['value'],
        });
      }
    }
  });

export const CalibrationTable1DSchema = z
  .object({
    name: z.string(),
    xUnit: z.string(),
    yUnit: z.string(),
    xValues: z.array(z.number()),
    yValues: z.array(z.number()),
  })
  .superRefine((val, ctx) => {
    if (val.xValues.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Calibration table '${val.name}' must be non-empty`,
        path: ['xValues'],
      });
      return;
    }
    if (val.xValues.length !== val.yValues.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Calibration table '${val.name}' xValues length (${val.xValues.length}) must match yValues length (${val.yValues.length})`,
        path: ['yValues'],
      });
    }
    let allXFinite = true;
    for (let i = 0; i < val.xValues.length; i++) {
      const x = val.xValues[i]!;
      if (!Number.isFinite(x)) {
        allXFinite = false;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Calibration table '${val.name}' xValues[${i}] must be finite, got ${x}`,
          path: ['xValues', i],
        });
      }
    }
    for (let i = 0; i < val.yValues.length; i++) {
      const y = val.yValues[i]!;
      if (!Number.isFinite(y)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Calibration table '${val.name}' yValues[${i}] must be finite, got ${y}`,
          path: ['yValues', i],
        });
      }
    }
    if (allXFinite) {
      for (let i = 1; i < val.xValues.length; i++) {
        const prev = val.xValues[i - 1]!;
        const curr = val.xValues[i]!;
        if (curr <= prev) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Calibration table '${val.name}' xValues must be strictly increasing: xValues[${i - 1}]=${prev}, xValues[${i}]=${curr}`,
            path: ['xValues', i],
          });
        }
      }
    }
  });

export const CalibrationDatasetSchema = z
  .object({
    schemaVersion: z.literal('calibration-dataset/1'),
    id: z.string().min(1),
    version: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    contentHash: z.string().min(1),
    parameters: z.record(z.string(), CalibrationParameterSchema),
    tables1D: z.record(z.string(), CalibrationTable1DSchema).optional(),
  })
  .superRefine((val, ctx) => {
    // Check parameter key/name equality
    for (const [key, param] of Object.entries(val.parameters)) {
      if (param.name !== key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Calibration parameter key '${key}' does not match parameter name '${param.name}'`,
          path: ['parameters', key, 'name'],
        });
      }
    }
    // Check table key/name equality
    if (val.tables1D) {
      for (const [key, table] of Object.entries(val.tables1D)) {
        if (table.name !== key) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Calibration table key '${key}' does not match table name '${table.name}'`,
            path: ['tables1D', key, 'name'],
          });
        }
      }
    }
  });

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
    const firstIssue = parseResult.error.issues[0];
    const msg = firstIssue?.message || parseResult.error.message;
    if (msg.includes('[INCOMPATIBLE_ANGLE_GRID]')) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_ANGLE_GRID',
        message: msg.replace(/\[INCOMPATIBLE_ANGLE_GRID\]\s*/g, ''),
        details: { errors: parseResult.error.issues },
      });
    }
    if (msg.includes('[PHYSICAL_INVARIANT_VIOLATION]')) {
      throw new SimulationError({
        code: 'PHYSICAL_INVARIANT_VIOLATION',
        message: msg.replace(/\[PHYSICAL_INVARIANT_VIOLATION\]\s*/g, ''),
        details: { errors: parseResult.error.issues },
      });
    }
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid simulation result structure: ${parseResult.error.message}`,
      details: { errors: parseResult.error.issues },
    });
  }

  return deepFreeze(parseResult.data as unknown as SimulationResultV1);
}

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
      message: `Unknown scenario comparison schema version: ${String(rawObj['schemaVersion'])}`,
      expected: 'scenario-comparison/1',
      actual: rawObj['schemaVersion'],
    });
  }
  const parseResult = ScenarioComparisonResultSchema.safeParse(raw);
  if (!parseResult.success) {
    throw new SimulationError({
      code: 'VALIDATION_FAILED',
      message: `Invalid scenario comparison result: ${parseResult.error.message}`,
      details: { errors: parseResult.error.issues },
    });
  }
  return deepFreeze(parseResult.data as unknown as ScenarioComparisonResult);
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
      message: `Corrupt calibration document: ${parseResult.error.issues.map((i) => i.message).join('; ')}`,
      details: { errors: parseResult.error.issues },
    });
  }
  return deepFreeze(parseResult.data as CalibrationDataset);
}
