import { QuantityType } from './quantities.js';
import { CrankAngleGrid, CrankAngleState } from './crank-angle.js';
import type { SimulationModelInput } from './models.js';

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly level: DiagnosticLevel;
  readonly moduleId?: string;
  readonly sampleIndex?: number;
  readonly angleDegrees?: number;
  readonly timestamp: string;
}

export interface ModuleIdentity {
  readonly id: string;
  readonly modelVersion: string; // semver
  readonly schemaVersion: string; // e.g. "calculation-result/1"
}

export interface CalculationResultV1<T = Record<string, unknown>> {
  readonly schemaVersion: 'calculation-result/1';
  readonly module: ModuleIdentity;
  readonly crankAngle?: CrankAngleState;
  readonly value: T;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ChannelSeries {
  readonly channelId: string;
  readonly name: string;
  readonly quantity: QuantityType;
  readonly unit: string;
  readonly samples: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

export interface ProvenanceRecord {
  readonly simulationTimestamp: string;
  readonly inputFingerprint: string; // SHA-256
  readonly calibrationId: string;
  readonly calibrationVersion: string;
  readonly calibrationContentHash: string; // SHA-256
  readonly participatingModules: readonly ModuleIdentity[];
  readonly orchestratorVersion: string;
  readonly schemaVersion: 'simulation-result/1';
}

export interface PerformanceSummary {
  readonly indicatedPowerKw: number;
  readonly brakePowerKw: number;
  readonly indicatedTorqueNm: number;
  readonly brakeTorqueNm: number;
  readonly indicatedWorkJ: number;
  readonly imepBar: number;
  readonly bmepBar: number;
  readonly fmepBar: number;
  readonly indicatedThermalEfficiencyPct: number;
  readonly brakeThermalEfficiencyPct: number;
  readonly mechanicalEfficiencyPct: number;
  readonly fuelMassPerCycleG: number;
  readonly specificFuelConsumptionGBhpKwh: number;
}

export type SimulationStatus = 'SUCCESS' | 'WARNING' | 'FAILED';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ConfidenceAssessment {
  readonly overallScore: number; // 0.0 to 1.0
  readonly confidenceLevel: ConfidenceLevel;
  readonly uncertaintyBandPct: number;
  readonly limitingFactors?: readonly string[];
}

export type ExplainabilityCategory =
  | 'combustion'
  | 'thermodynamics'
  | 'kinematics'
  | 'gas_exchange'
  | 'friction'
  | 'ignition'
  | 'camshaft'
  | string;

export type ExplainabilityDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface ExplainabilityContribution {
  readonly category: ExplainabilityCategory;
  readonly parameter: string;
  readonly impactPct: number;
  readonly direction: ExplainabilityDirection;
  readonly rationale: string;
}

export interface ExplainabilityReport {
  readonly summary: string;
  readonly contributions: readonly ExplainabilityContribution[];
}

export interface MetricDelta {
  readonly baselineValue: number;
  readonly modifiedValue: number;
  readonly absoluteDelta: number;
  readonly percentageDelta: number;
  readonly unit: string;
}

export interface ChannelDeltaSeries {
  readonly channelId: string;
  readonly name: string;
  readonly quantity: QuantityType;
  readonly unit: string;
  readonly deltaSamples: readonly number[]; // modified - baseline
  readonly maxAbsoluteDelta: number;
}

export interface ScenarioComparisonResult {
  readonly schemaVersion: 'scenario-comparison/1';
  readonly comparisonId: string;
  readonly timestamp: string;
  readonly baselineResultId: string;
  readonly modifiedResultId: string;
  readonly baselineModelId: string;
  readonly modifiedModelId: string;
  readonly summaryDeltas: {
    readonly indicatedPowerKw: MetricDelta;
    readonly brakePowerKw: MetricDelta;
    readonly indicatedTorqueNm: MetricDelta;
    readonly brakeTorqueNm: MetricDelta;
    readonly imepBar: MetricDelta;
    readonly bmepBar: MetricDelta;
    readonly brakeThermalEfficiencyPct: MetricDelta;
    readonly specificFuelConsumptionGBhpKwh: MetricDelta;
    readonly peakPressureBar?: MetricDelta;
  };
  readonly channelDeltas: readonly ChannelDeltaSeries[];
  readonly narrativeSummary: string;
  readonly keyFindings: readonly string[];
}

export interface ScenarioComparisonInput {
  readonly baseline: SimulationResultV1;
  readonly modified: SimulationResultV1;
}

export interface SimulationResultV1 {
  readonly schemaVersion: 'simulation-result/1';
  readonly resultId: string;
  readonly status: SimulationStatus;
  readonly model: ModuleIdentity;
  readonly provenance: ProvenanceRecord;
  readonly normalizedConfiguration: SimulationModelInput;
  readonly assumptions: readonly string[];
  readonly confidence: ConfidenceAssessment;
  readonly explainability: ExplainabilityReport;
  readonly crankAngleGrid: CrankAngleGrid;
  readonly channels: readonly ChannelSeries[];
  readonly summary: PerformanceSummary;
  readonly diagnostics: readonly Diagnostic[];
}
