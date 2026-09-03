import * as crypto from 'node:crypto';
import {
  CalibrationRepository,
  SimulationError,
  SimulationModel,
  SimulationResultV1,
  ScenarioComparisonResult,
  MetricDelta,
  ChannelDeltaSeries,
  parseSimulationResultV1,
  parseScenarioComparisonResult,
  deepFreeze,
} from '@engine-analyzer/contracts';
import { validateSimulationModelInput, computeInputFingerprint } from '@engine-analyzer/validation';
import { PluginRegistry } from '@engine-analyzer/plugins';

export interface OrchestratorOptions {
  readonly calibrationRepository: CalibrationRepository;
  readonly pluginRegistry: PluginRegistry;
}

export function compareScenarios(
  baseline: SimulationResultV1,
  modified: SimulationResultV1
): ScenarioComparisonResult {
  const bGrid = baseline.crankAngleGrid;
  const mGrid = modified.crankAngleGrid;

  if (
    bGrid.convention.cycleDegrees !== mGrid.convention.cycleDegrees ||
    bGrid.convention.conventionId !== mGrid.convention.conventionId ||
    bGrid.resolutionDeg !== mGrid.resolutionDeg ||
    bGrid.sampleCount !== mGrid.sampleCount ||
    bGrid.startAngleDeg !== mGrid.startAngleDeg ||
    bGrid.endAngleDeg !== mGrid.endAngleDeg
  ) {
    throw new SimulationError({
      code: 'INCOMPATIBLE_ANGLE_GRID',
      message: `Cannot compare simulation results with incompatible crank angle grids: baseline [${bGrid.convention.conventionId}, ${bGrid.convention.cycleDegrees}°, res=${bGrid.resolutionDeg}°, count=${bGrid.sampleCount}] vs modified [${mGrid.convention.conventionId}, ${mGrid.convention.cycleDegrees}°, res=${mGrid.resolutionDeg}°, count=${mGrid.sampleCount}].`,
      expected: {
        conventionId: bGrid.convention.conventionId,
        cycleDegrees: bGrid.convention.cycleDegrees,
        resolutionDeg: bGrid.resolutionDeg,
        sampleCount: bGrid.sampleCount,
      },
      actual: {
        conventionId: mGrid.convention.conventionId,
        cycleDegrees: mGrid.convention.cycleDegrees,
        resolutionDeg: mGrid.resolutionDeg,
        sampleCount: mGrid.sampleCount,
      },
    });
  }

  const calcDelta = (bVal: number, mVal: number, unit: string): MetricDelta => {
    const absDelta = Math.round((mVal - bVal) * 1000) / 1000;
    const pctDelta = bVal !== 0 ? Math.round(((mVal - bVal) / Math.abs(bVal)) * 10000) / 100 : 0;
    return {
      baselineValue: bVal,
      modifiedValue: mVal,
      absoluteDelta: absDelta,
      percentageDelta: pctDelta,
      unit,
    };
  };

  const bSummary = baseline.summary;
  const mSummary = modified.summary;

  const summaryDeltas = {
    indicatedPowerKw: calcDelta(bSummary.indicatedPowerKw, mSummary.indicatedPowerKw, 'kW'),
    brakePowerKw: calcDelta(bSummary.brakePowerKw, mSummary.brakePowerKw, 'kW'),
    indicatedTorqueNm: calcDelta(bSummary.indicatedTorqueNm, mSummary.indicatedTorqueNm, 'Nm'),
    brakeTorqueNm: calcDelta(bSummary.brakeTorqueNm, mSummary.brakeTorqueNm, 'Nm'),
    imepBar: calcDelta(bSummary.imepBar, mSummary.imepBar, 'bar'),
    bmepBar: calcDelta(bSummary.bmepBar, mSummary.bmepBar, 'bar'),
    brakeThermalEfficiencyPct: calcDelta(
      bSummary.brakeThermalEfficiencyPct,
      mSummary.brakeThermalEfficiencyPct,
      '%'
    ),
    specificFuelConsumptionGBhpKwh: calcDelta(
      bSummary.specificFuelConsumptionGBhpKwh,
      mSummary.specificFuelConsumptionGBhpKwh,
      'g/kWh'
    ),
  };

  // Compare common channels
  const channelDeltas: ChannelDeltaSeries[] = [];
  for (const bChan of baseline.channels) {
    const mChan = modified.channels.find((c) => c.channelId === bChan.channelId);
    if (mChan) {
      if (mChan.quantity !== bChan.quantity || mChan.unit !== bChan.unit) {
        throw new SimulationError({
          code: 'VALIDATION_FAILED',
          message: `Incompatible channel metadata for channel '${bChan.channelId}': baseline is (${bChan.quantity}, ${bChan.unit}) but modified is (${mChan.quantity}, ${mChan.unit}).`,
          target: bChan.channelId,
          expected: { quantity: bChan.quantity, unit: bChan.unit },
          actual: { quantity: mChan.quantity, unit: mChan.unit },
        });
      }
      if (mChan.samples.length !== bChan.samples.length) {
        throw new SimulationError({
          code: 'INCOMPATIBLE_ANGLE_GRID',
          message: `Channel '${bChan.channelId}' sample length mismatch: baseline has ${bChan.samples.length} samples, modified has ${mChan.samples.length} samples.`,
          target: bChan.channelId,
          expected: bChan.samples.length,
          actual: mChan.samples.length,
        });
      }

      const deltaSamples = mChan.samples.map(
        (val, idx) => Math.round((val - (bChan.samples[idx] ?? 0)) * 1000) / 1000
      );
      const maxAbs = Math.max(...deltaSamples.map(Math.abs));
      channelDeltas.push({
        channelId: bChan.channelId,
        name: `${bChan.name} Delta`,
        quantity: bChan.quantity,
        unit: bChan.unit,
        deltaSamples,
        maxAbsoluteDelta: Math.round(maxAbs * 1000) / 1000,
      });
    }
  }

  const keyFindings: string[] = [];
  const powerDiff = summaryDeltas.brakePowerKw.percentageDelta;
  if (Math.abs(powerDiff) >= 0.1) {
    keyFindings.push(
      `Brake power changed by ${powerDiff > 0 ? '+' : ''}${powerDiff.toFixed(2)}% (${summaryDeltas.brakePowerKw.absoluteDelta.toFixed(2)} kW).`
    );
  }
  const torqueDiff = summaryDeltas.brakeTorqueNm.percentageDelta;
  if (Math.abs(torqueDiff) >= 0.1) {
    keyFindings.push(
      `Brake torque changed by ${torqueDiff > 0 ? '+' : ''}${torqueDiff.toFixed(2)}% (${summaryDeltas.brakeTorqueNm.absoluteDelta.toFixed(2)} Nm).`
    );
  }
  const bsfDiff = summaryDeltas.specificFuelConsumptionGBhpKwh.percentageDelta;
  if (Math.abs(bsfDiff) >= 0.1) {
    keyFindings.push(
      `BSFC changed by ${bsfDiff > 0 ? '+' : ''}${bsfDiff.toFixed(2)}% (${summaryDeltas.specificFuelConsumptionGBhpKwh.absoluteDelta.toFixed(2)} g/kWh).`
    );
  }
  if (keyFindings.length === 0) {
    keyFindings.push('Baseline and modified configurations yield equivalent performance metrics.');
  }

  const narrativeSummary = `Comparison between baseline (${baseline.model.id}) and modified (${modified.model.id}) scenarios: Brake power ${
    powerDiff >= 0 ? 'increased' : 'decreased'
  } by ${Math.abs(powerDiff).toFixed(2)}% with BMEP delta of ${summaryDeltas.bmepBar.absoluteDelta.toFixed(2)} bar.`;

  const comparisonResult: ScenarioComparisonResult = {
    schemaVersion: 'scenario-comparison/1',
    comparisonId: `cmp_${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    baselineResultId: baseline.resultId,
    modifiedResultId: modified.resultId,
    baselineModelId: baseline.model.id,
    modifiedModelId: modified.model.id,
    summaryDeltas,
    channelDeltas,
    narrativeSummary,
    keyFindings,
  };

  return parseScenarioComparisonResult(comparisonResult);
}

export class SimulationOrchestrator {
  private readonly calRepo: CalibrationRepository;
  private readonly plugins: PluginRegistry;
  public readonly orchestratorVersion = '1.0.0';

  constructor(options: OrchestratorOptions) {
    this.calRepo = options.calibrationRepository;
    this.plugins = options.pluginRegistry;
  }

  public runSimulation(rawInput: unknown, modelId?: string): SimulationResultV1 {
    // 1. Validate input strictly (Phase 2 boundary)
    const validatedInput = validateSimulationModelInput(rawInput);

    // 2. Resolve calibration strictly from repository (Phase 2 boundary)
    const calibration = this.calRepo.get(validatedInput.calibrationId, validatedInput.calibrationVersion);

    // 3. Select model plugin from registry (Phase 6 boundary)
    const targetModelId = modelId ?? 'model.four-stroke.baseline';
    const model = this.plugins.getModel(targetModelId);

    // 4. Execute simulation on the pluggable model
    let rawResult: SimulationResultV1;
    try {
      rawResult = model.simulate(validatedInput, calibration);
    } catch (err) {
      if (err instanceof SimulationError) {
        throw err;
      }
      throw new SimulationError({
        code: 'CALCULATION_NON_CONVERGENCE',
        message: `Model '${targetModelId}' threw an unhandled exception: ${err instanceof Error ? err.message : String(err)}`,
        details: { originalError: String(err) },
      });
    }

    // 5. Post-execution verification and invariant checks
    const parsedResult = parseSimulationResultV1(rawResult);

    // Check for duplicate channel IDs
    const channelIds = new Set<string>();
    for (const ch of parsedResult.channels) {
      if (channelIds.has(ch.channelId)) {
        throw new SimulationError({
          code: 'DUPLICATE_CHANNEL',
          message: `Duplicate channel ID detected in simulation result: '${ch.channelId}'`,
          target: ch.channelId,
        });
      }
      channelIds.add(ch.channelId);
    }

    // Check that declared output channels from model manifest are all provided
    for (const declared of model.outputChannels) {
      if (!channelIds.has(declared.id)) {
        throw new SimulationError({
          code: 'CHANNEL_NOT_FOUND',
          message: `Model '${model.manifest.id}' declared output channel '${declared.id}' which was missing in simulation result.`,
          target: declared.id,
        });
      }
    }

    // Verify model identity matches the invoked plugin
    if (parsedResult.model.id !== model.manifest.id) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_PLUGIN',
        message: `Simulation result model ID '${parsedResult.model.id}' does not match invoked model '${model.manifest.id}'`,
        expected: model.manifest.id,
        actual: parsedResult.model.id,
      });
    }
    if (parsedResult.model.modelVersion !== model.manifest.version) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_PLUGIN',
        message: `Simulation result modelVersion '${parsedResult.model.modelVersion}' does not match plugin manifest version '${model.manifest.version}'`,
        expected: model.manifest.version,
        actual: parsedResult.model.modelVersion,
      });
    }

    // Verify calibration identity in provenance matches authoritative calibration
    if (parsedResult.provenance.calibrationId !== calibration.id) {
      throw new SimulationError({
        code: 'CALIBRATION_VERSION_MISMATCH',
        message: `Simulation result calibrationId '${parsedResult.provenance.calibrationId}' does not match selected calibration '${calibration.id}'`,
        expected: calibration.id,
        actual: parsedResult.provenance.calibrationId,
      });
    }
    if (parsedResult.provenance.calibrationVersion !== calibration.version) {
      throw new SimulationError({
        code: 'CALIBRATION_VERSION_MISMATCH',
        message: `Simulation result calibrationVersion '${parsedResult.provenance.calibrationVersion}' does not match selected calibration '${calibration.version}'`,
        expected: calibration.version,
        actual: parsedResult.provenance.calibrationVersion,
      });
    }
    if (parsedResult.provenance.calibrationContentHash !== calibration.contentHash) {
      throw new SimulationError({
        code: 'CALIBRATION_CORRUPT',
        message: `Simulation result provenance calibration hash (${parsedResult.provenance.calibrationContentHash}) does not match repository hash (${calibration.contentHash})`,
        expected: calibration.contentHash,
        actual: parsedResult.provenance.calibrationContentHash,
      });
    }

    // Verify participating modules list contains the invoked model
    const hasModelModule = parsedResult.provenance.participatingModules.some(
      (m) => m.id === model.manifest.id && m.modelVersion === model.manifest.version
    );
    if (!hasModelModule) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_PLUGIN',
        message: `Simulation result participatingModules must include model '${model.manifest.id}@${model.manifest.version}'`,
      });
    }

    // Verify provenance input fingerprint consistency
    const expectedInputFingerprint = computeInputFingerprint(validatedInput);
    if (parsedResult.provenance.inputFingerprint !== expectedInputFingerprint) {
      throw new SimulationError({
        code: 'VALIDATION_FAILED',
        message: `Simulation result provenance input fingerprint (${parsedResult.provenance.inputFingerprint}) does not match expected input fingerprint (${expectedInputFingerprint})`,
        expected: expectedInputFingerprint,
        actual: parsedResult.provenance.inputFingerprint,
      });
    }

    return deepFreeze(parsedResult);
  }

  public compareScenarios(
    baseline: SimulationResultV1,
    modified: SimulationResultV1
  ): ScenarioComparisonResult {
    return compareScenarios(baseline, modified);
  }

  public runComparison(
    baselineInput: unknown,
    modifiedInput: unknown,
    modelId?: string
  ): {
    readonly baseline: SimulationResultV1;
    readonly modified: SimulationResultV1;
    readonly comparison: ScenarioComparisonResult;
  } {
    const baseline = this.runSimulation(baselineInput, modelId);
    const modified = this.runSimulation(modifiedInput, modelId);
    const comparison = this.compareScenarios(baseline, modified);
    return deepFreeze({ baseline, modified, comparison });
  }
}
