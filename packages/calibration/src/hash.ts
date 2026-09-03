import * as crypto from 'node:crypto';
import { CalibrationDataset } from '@engine-analyzer/contracts';

export function computeCalibrationHash(dataset: Omit<CalibrationDataset, 'contentHash'> | CalibrationDataset): string {
  // Sort parameters and tables deterministically
  const canonicalObject = {
    schemaVersion: dataset.schemaVersion,
    id: dataset.id,
    version: dataset.version,
    name: dataset.name,
    description: dataset.description,
    parameters: Object.keys(dataset.parameters)
      .sort()
      .reduce((acc, key) => {
        acc[key] = dataset.parameters[key];
        return acc;
      }, {} as Record<string, unknown>),
    tables1D: dataset.tables1D
      ? Object.keys(dataset.tables1D)
          .sort()
          .reduce((acc, key) => {
            acc[key] = dataset.tables1D![key];
            return acc;
          }, {} as Record<string, unknown>)
      : undefined,
  };

  const json = JSON.stringify(canonicalObject);
  return crypto.createHash('sha256').update(json, 'utf-8').digest('hex');
}
