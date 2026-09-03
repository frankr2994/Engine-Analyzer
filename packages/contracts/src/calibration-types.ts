export interface CalibrationParameter {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly description: string;
  readonly min?: number;
  readonly max?: number;
}

export interface CalibrationTable1D {
  readonly name: string;
  readonly xUnit: string;
  readonly yUnit: string;
  readonly xValues: readonly number[];
  readonly yValues: readonly number[];
}

export interface CalibrationDataset {
  readonly schemaVersion: 'calibration-dataset/1';
  readonly id: string;
  readonly version: string; // semver
  readonly name: string;
  readonly description: string;
  readonly contentHash: string; // SHA-256
  readonly parameters: Readonly<Record<string, CalibrationParameter>>;
  readonly tables1D?: Readonly<Record<string, CalibrationTable1D>>;
}

export interface CalibrationRepository {
  get(id: string, version: string): CalibrationDataset;
  has(id: string, version: string): boolean;
  register(dataset: CalibrationDataset): void;
  list(): readonly { id: string; version: string; name: string }[];
}
