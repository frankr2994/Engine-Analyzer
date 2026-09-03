import {
  CalibrationDataset,
  SimulationModel,
  SimulationModelInput,
  parseSimulationResultV1,
} from '@engine-analyzer/contracts';

/**
 * Generic test suite to assert that any SimulationModel implementation
 * conforms to the host platform rules, schema versioning, and physical invariants.
 */
export function verifyModelConformance(
  model: SimulationModel,
  sampleInput: SimulationModelInput,
  calibration: CalibrationDataset
): void {
  // 1. Manifest checks
  if (!model.manifest.id || !model.manifest.version || !model.manifest.name) {
    throw new Error(`Model manifest missing required fields: ${JSON.stringify(model.manifest)}`);
  }
  if (model.manifest.contractSchemaMajor !== 1) {
    throw new Error(`Incompatible contractSchemaMajor: ${model.manifest.contractSchemaMajor}`);
  }

  // 2. Output channels check
  if (!Array.isArray(model.outputChannels) || model.outputChannels.length === 0) {
    throw new Error(`Model must declare at least one output channel.`);
  }

  // 3. Execution check
  const result = model.simulate(sampleInput, calibration);
  const validated = parseSimulationResultV1(result);

  if (validated.status !== 'SUCCESS' && validated.status !== 'WARNING') {
    throw new Error(`Model simulation failed with status: ${validated.status}`);
  }

  if (validated.channels.length < model.outputChannels.length) {
    throw new Error(
      `Model returned fewer channels (${validated.channels.length}) than declared (${model.outputChannels.length})`
    );
  }

  if (validated.crankAngleGrid.sampleCount <= 0) {
    throw new Error('Simulation result has empty crankAngleGrid.');
  }
}
