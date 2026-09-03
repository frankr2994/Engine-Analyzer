import {
  CalibrationDataset,
  CalibrationRepository,
  SimulationError,
  deepFreeze,
  parseCalibrationDataset,
} from '@engine-analyzer/contracts';
import { computeCalibrationHash } from './hash.js';

export class InMemoryCalibrationRepository implements CalibrationRepository {
  private readonly datasets = new Map<string, CalibrationDataset>();

  constructor(initialDatasets: readonly CalibrationDataset[] = []) {
    for (const ds of initialDatasets) {
      this.register(ds);
    }
  }

  private makeKey(id: string, version: string): string {
    return `${id}@${version}`;
  }

  public register(dataset: CalibrationDataset): void {
    // Validate schema
    const validated = parseCalibrationDataset(dataset);

    // Verify content hash integrity
    const expectedHash = computeCalibrationHash(validated);
    if (validated.contentHash !== expectedHash) {
      throw new SimulationError({
        code: 'CALIBRATION_CORRUPT',
        message: `Calibration dataset '${validated.id}@${validated.version}' has invalid content hash. Expected: ${expectedHash}, Actual: ${validated.contentHash}`,
        target: validated.id,
        expected: expectedHash,
        actual: validated.contentHash,
      });
    }

    const key = this.makeKey(validated.id, validated.version);
    this.datasets.set(key, deepFreeze(validated));
  }

  public get(id: string, version: string): CalibrationDataset {
    const key = this.makeKey(id, version);
    const found = this.datasets.get(key);
    if (!found) {
      throw new SimulationError({
        code: 'CALIBRATION_NOT_FOUND',
        message: `Calibration dataset '${id}@${version}' not found in repository.`,
        target: id,
        expected: `${id}@${version}`,
      });
    }
    return found;
  }

  public has(id: string, version: string): boolean {
    return this.datasets.has(this.makeKey(id, version));
  }

  public list(): readonly { id: string; version: string; name: string }[] {
    const list: { id: string; version: string; name: string }[] = [];
    for (const ds of this.datasets.values()) {
      list.push({ id: ds.id, version: ds.version, name: ds.name });
    }
    return deepFreeze(list);
  }
}
