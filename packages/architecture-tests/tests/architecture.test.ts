import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFileImports,
  checkDirectoryImports,
  extractImports,
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

  it('detects standalone CommonJS require and dynamic import in any position', () => {
    const code = `
      const forbidden = require('@engine-analyzer/calibration');
      async function test() {
        const dyn = await import('@engine-analyzer/baseline-engine');
      }
    `;
    const violations = checkFileImports('/dummy/packages/presentation/src/test.ts', 'presentation', code);
    expect(violations.length).toBe(2);
    expect(violations[0]?.importedModule).toBe('@engine-analyzer/calibration');
    expect(violations[1]?.importedModule).toBe('@engine-analyzer/baseline-engine');
  });

  it('detects template literal imports and requires including no-substitution template strings', () => {
    const code = `
      const forbidden = require(\`@engine-analyzer/calibration\`);
      async function test() {
        const dyn = await import(\`@engine-analyzer/baseline-engine\`);
      }
    `;
    const violations = checkFileImports('/dummy/packages/presentation/src/test.ts', 'presentation', code);
    expect(violations.length).toBe(2);
    expect(violations[0]?.importedModule).toBe('@engine-analyzer/calibration');
    expect(violations[1]?.importedModule).toBe('@engine-analyzer/baseline-engine');
  });

  it('ensures all current codebase packages strictly satisfy architectural import boundaries', () => {
    const violations = checkDirectoryImports(packagesRoot);
    expect(violations).toEqual([]);
  });

  it('correctly extracts imports across AST node types including dynamic import, CommonJS require, template literals, export-from, and ignores comments/strings', () => {
    const sample = `
      // Single line comment: import { bad } from '@engine-analyzer/forbidden';
      /* Multiline comment:
         import { bad2 } from '@engine-analyzer/forbidden2';
         export * from '@engine-analyzer/forbidden3';
      */
      import {
        TypeA,
        TypeB,
      } from '@engine-analyzer/contracts';
      import DefaultComp from \`@engine-analyzer/presentation\`;
      import * as Anim from '@engine-analyzer/animation';
      import 'side-effect-polyfill';
      export { Chart } from '@engine-analyzer/charts';
      export * from \`@engine-analyzer/models\`;
      import legacy = require('@engine-analyzer/legacy');
      const cjs = require('@engine-analyzer/cjs-module');
      const cjsTemplate = require(\`@engine-analyzer/template-cjs\`);
      async function run() {
        const dyn = await import('@engine-analyzer/dynamic-mod');
        const dynTemplate = await import(\`@engine-analyzer/dynamic-template\`);
      }
      const fake = "import { notReal } from '@engine-analyzer/in-string'";
    `;

    const extracted = extractImports(sample);
    expect(extracted).toEqual([
      '@engine-analyzer/contracts',
      '@engine-analyzer/presentation',
      '@engine-analyzer/animation',
      'side-effect-polyfill',
      '@engine-analyzer/charts',
      '@engine-analyzer/models',
      '@engine-analyzer/legacy',
      '@engine-analyzer/cjs-module',
      '@engine-analyzer/template-cjs',
      '@engine-analyzer/dynamic-mod',
      '@engine-analyzer/dynamic-template',
    ]);
  });
});
