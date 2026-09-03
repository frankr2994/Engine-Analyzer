import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFileImports,
  checkDirectoryImports,
} from '../src/import-boundary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(__dirname, '../../');
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('Architecture Boundary and Import Enforcement', () => {
  it('detects and rejects deliberately illegal presentation import of calibration', () => {
    const fixturePath = path.join(fixturesDir, 'illegal-presentation-import.ts');
    const violations = checkFileImports(fixturePath, 'presentation');

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.importedModule).toBe('@engine-analyzer/calibration');
    expect(violations[0]?.reason).toMatch(/strictly forbidden/);
  });

  it('detects and rejects deliberately illegal contracts import of concrete model', () => {
    const fixturePath = path.join(fixturesDir, 'illegal-contract-import.ts');
    const violations = checkFileImports(fixturePath, 'contracts');

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.importedModule).toBe('@engine-analyzer/baseline-engine');
    expect(violations[0]?.reason).toMatch(/strictly forbidden/);
  });

  it('detects and rejects deliberately non-allowlisted package import', () => {
    const fixturePath = path.join(fixturesDir, 'illegal-non-allowlisted-import.ts');
    const violations = checkFileImports(fixturePath, 'orchestrator');

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.importedModule).toBe('@engine-analyzer/kinematics');
    expect(violations[0]?.reason).toMatch(/not allowed to import/);
  });

  it('detects and rejects deliberately deep internal package import', () => {
    const fixturePath = path.join(fixturesDir, 'illegal-deep-import.ts');
    const violations = checkFileImports(fixturePath, 'validation');

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.importedModule).toBe('@engine-analyzer/contracts/results');
    expect(violations[0]?.reason).toMatch(/Deep internal import/);
  });

  it('ensures all current codebase packages strictly satisfy architectural import boundaries', () => {
    const violations = checkDirectoryImports(packagesRoot);
    expect(violations).toEqual([]);
  });
});
