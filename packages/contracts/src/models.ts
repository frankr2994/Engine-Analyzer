import { QuantityType } from './quantities.js';
import { CalculationResultV1, SimulationResultV1 } from './results.js';
import { CalibrationDataset } from './calibration-types.js';

export interface CamshaftTimingInput {
  readonly intakeValveOpenDegBtdc: number; // IVO in deg BTDC (e.g. 10.0)
  readonly intakeValveCloseDegAbdc: number; // IVC in deg ABDC (e.g. 50.0)
  readonly exhaustValveOpenDegBbdc: number; // EVO in deg BBDC (e.g. 55.0)
  readonly exhaustValveCloseDegAtdc: number; // EVC in deg ATDC (e.g. 15.0)
  readonly intakeLiftMm?: number;
  readonly exhaustLiftMm?: number;
  readonly intakeDurationDeg?: number;
  readonly exhaustDurationDeg?: number;
  readonly lobeSeparationAngleDeg?: number;
}

export interface EngineGeometryInput {
  readonly boreMm: number;
  readonly strokeMm: number;
  readonly connectingRodLengthMm: number;
  readonly compressionRatio: number;
  readonly cylinderCount: number;
  readonly wristPinOffsetMm?: number;
  readonly camshaft?: CamshaftTimingInput;
}

export interface OperatingConditionsInput {
  readonly rpm: number;
  readonly intakePressureBar: number;
  readonly intakeTemperatureK: number;
  readonly sparkTimingDegBtdc: number;
  readonly airFuelRatio: number;
  readonly combustionDurationDeg?: number;
}

export interface SimulationModelInput {
  readonly engine: EngineGeometryInput;
  readonly operating: OperatingConditionsInput;
  readonly calibrationId: string;
  readonly calibrationVersion: string;
  readonly resolutionDeg?: number;
}

export interface CalculationModule<TInput, TOutput> {
  readonly id: string;
  readonly modelVersion: string;
  readonly schemaVersion: string;
  calculate(input: TInput): CalculationResultV1<TOutput>;
}

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string; // semver
  readonly contractSchemaMajor: number; // 1
  readonly capabilities: readonly string[];
  readonly description: string;
  readonly supportedEngineTypes: readonly ('FOUR_STROKE_OTTO' | 'TWO_STROKE_OTTO' | 'FOUR_STROKE_DIESEL' | string)[];
}

export interface SimulationModel<TInput = SimulationModelInput> {
  readonly manifest: PluginManifest;
  readonly outputChannels: readonly {
    readonly id: string;
    readonly name: string;
    readonly quantity: QuantityType;
    readonly unit: string;
  }[];
  simulate(input: TInput, calibration: CalibrationDataset): SimulationResultV1;
}
