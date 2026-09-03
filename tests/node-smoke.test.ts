import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

describe('Standalone Node Execution of Compiled Output & Workspaces', () => {
  beforeAll(() => {
    const distEntry = path.join(projectRoot, 'dist', 'packages', 'composition-root', 'src', 'index.js');
    if (!fs.existsSync(distEntry)) {
      execFileSync(process.execPath, ['./node_modules/typescript/bin/tsc'], {
        cwd: projectRoot,
        encoding: 'utf-8',
      });
    }
  });

  it('executes the compiled composition-root artifact in standalone Node process via dist file path', () => {
    const script = `
      import { createEngineSimulationApp } from './dist/packages/composition-root/src/index.js';
      const app = createEngineSimulationApp();
      const res = app.orchestrator.runSimulation({
        engine: { boreMm: 84, strokeMm: 90, connectingRodLengthMm: 145, compressionRatio: 10.5, cylinderCount: 4 },
        operating: { rpm: 3000, intakePressureBar: 1, intakeTemperatureK: 298.15, sparkTimingDegBtdc: 18, airFuelRatio: 14.7 },
        calibrationId: 'cal.baseline.naturally_aspirated_2l',
        calibrationVersion: '1.0.0'
      });
      if (res.status !== 'SUCCESS') process.exit(1);
      const controller = app.createAnimationController(res);
      const pres = app.createPresentation(res, controller);
      if (!pres.renderer || !pres.pvChart) process.exit(2);
      console.log('DIST_NODE_STANDALONE_SUCCESS');
    `;

    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: projectRoot,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    expect(stdout).toContain('DIST_NODE_STANDALONE_SUCCESS');
  });

  it('executes standalone Node resolving workspace packages via @engine-analyzer/* package names', () => {
    const script = `
      import { createEngineSimulationApp } from '@engine-analyzer/composition-root';
      const app = createEngineSimulationApp();
      const res4 = app.orchestrator.runSimulation({
        engine: { boreMm: 84, strokeMm: 90, connectingRodLengthMm: 145, compressionRatio: 10.5, cylinderCount: 4 },
        operating: { rpm: 3000, intakePressureBar: 1, intakeTemperatureK: 298.15, sparkTimingDegBtdc: 18, airFuelRatio: 14.7 },
        calibrationId: 'cal.baseline.naturally_aspirated_2l',
        calibrationVersion: '1.0.0'
      });
      const res2 = app.orchestrator.runSimulation({
        engine: { boreMm: 54, strokeMm: 54, connectingRodLengthMm: 110, compressionRatio: 8.5, cylinderCount: 1 },
        operating: { rpm: 8000, intakePressureBar: 1, intakeTemperatureK: 298.15, sparkTimingDegBtdc: 20, airFuelRatio: 12.5 },
        calibrationId: 'cal.baseline.naturally_aspirated_2l',
        calibrationVersion: '1.0.0'
      }, 'model.two-stroke.baseline');

      if (res4.status !== 'SUCCESS' || res2.status !== 'SUCCESS') process.exit(1);
      if (res4.summary.brakePowerKw <= 0 || res2.summary.brakePowerKw <= 0) process.exit(2);
      console.log('WORKSPACE_NODE_STANDALONE_SUCCESS');
    `;

    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: projectRoot,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    expect(stdout).toContain('WORKSPACE_NODE_STANDALONE_SUCCESS');
  });
});
