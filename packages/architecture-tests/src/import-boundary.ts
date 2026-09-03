import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export interface DependencyRule {
  readonly allowedImports: readonly string[];
  readonly forbiddenImports: readonly string[];
}

export const ARCHITECTURE_RULES: Readonly<Record<string, DependencyRule>> = Object.freeze({
  contracts: {
    allowedImports: [],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/kinematics',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
      '@engine-analyzer/animation',
      '@engine-analyzer/presentation',
      '@engine-analyzer/plugin-two-stroke',
      '@engine-analyzer/composition-root',
    ],
  },
  validation: {
    allowedImports: ['@engine-analyzer/contracts'],
    forbiddenImports: [
      '@engine-analyzer/calibration',
      '@engine-analyzer/kinematics',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
      '@engine-analyzer/animation',
      '@engine-analyzer/presentation',
    ],
  },
  calibration: {
    allowedImports: ['@engine-analyzer/contracts'],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/kinematics',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
      '@engine-analyzer/animation',
      '@engine-analyzer/presentation',
    ],
  },
  kinematics: {
    allowedImports: ['@engine-analyzer/contracts'],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
      '@engine-analyzer/animation',
      '@engine-analyzer/presentation',
    ],
  },
  'baseline-engine': {
    allowedImports: [
      '@engine-analyzer/contracts',
      '@engine-analyzer/kinematics',
    ],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
      '@engine-analyzer/animation',
      '@engine-analyzer/presentation',
    ],
  },
  'plugin-two-stroke': {
    allowedImports: [
      '@engine-analyzer/contracts',
      '@engine-analyzer/kinematics',
    ],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
      '@engine-analyzer/animation',
      '@engine-analyzer/presentation',
    ],
  },
  plugins: {
    allowedImports: ['@engine-analyzer/contracts'],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/animation',
      '@engine-analyzer/presentation',
    ],
  },
  animation: {
    allowedImports: ['@engine-analyzer/contracts'],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/kinematics',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
      '@engine-analyzer/presentation',
    ],
  },
  presentation: {
    allowedImports: ['@engine-analyzer/contracts', '@engine-analyzer/animation'],
    forbiddenImports: [
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/kinematics',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/plugin-two-stroke',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/plugins',
    ],
  },
  orchestrator: {
    allowedImports: [
      '@engine-analyzer/contracts',
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/plugins',
    ],
    forbiddenImports: [
      '@engine-analyzer/presentation',
      '@engine-analyzer/animation',
    ],
  },
  'composition-root': {
    allowedImports: [
      '@engine-analyzer/contracts',
      '@engine-analyzer/validation',
      '@engine-analyzer/calibration',
      '@engine-analyzer/kinematics',
      '@engine-analyzer/baseline-engine',
      '@engine-analyzer/plugin-two-stroke',
      '@engine-analyzer/plugins',
      '@engine-analyzer/animation',
      '@engine-analyzer/orchestrator',
      '@engine-analyzer/presentation',
    ],
    forbiddenImports: [],
  },
});

export interface ImportViolation {
  readonly filePath: string;
  readonly packageName: string;
  readonly importedModule: string;
  readonly reason: string;
}

function getStringValue(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/**
 * Extracts all module specifiers using full recursive TypeScript AST traversal.
 * Detects:
 * - import declarations: import x from 'mod'; import 'mod'; import `mod`;
 * - export declarations: export * from 'mod'; export { x } from `mod`;
 * - import-equals declarations: import x = require('mod');
 * - dynamic imports: import('mod'), import(`mod`)
 * - CommonJS require calls in any statement/expression: require('mod'), require(`mod`)
 */
export function extractImports(sourceCode: string, fileName = 'file.ts'): string[] {
  const sourceFile = ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];

  function visit(node: ts.Node): void {
    // 1. Static import: import ... from 'mod' or import 'mod'
    if (ts.isImportDeclaration(node)) {
      const val = getStringValue(node.moduleSpecifier);
      if (val) {
        imports.push(val);
      }
    }
    // 2. Export from: export ... from 'mod'
    else if (ts.isExportDeclaration(node)) {
      const val = getStringValue(node.moduleSpecifier);
      if (val) {
        imports.push(val);
      }
    }
    // 3. Import equals: import x = require('mod')
    else if (ts.isImportEqualsDeclaration(node)) {
      if (
        node.moduleReference &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression
      ) {
        const val = getStringValue(node.moduleReference.expression);
        if (val) {
          imports.push(val);
        }
      }
    }
    // 4. Call expressions: require('mod') or dynamic import('mod')
    else if (ts.isCallExpression(node)) {
      // dynamic import('mod') or import(`mod`)
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const val = getStringValue(node.arguments[0]);
        if (val) {
          imports.push(val);
        }
      }
      // CommonJS require('mod') or require(`mod`)
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const val = getStringValue(node.arguments[0]);
        if (val) {
          imports.push(val);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

export function checkFileImports(filePath: string, packageName: string, sourceCode?: string): ImportViolation[] {
  const code = sourceCode ?? fs.readFileSync(filePath, 'utf-8');
  const imports = extractImports(code, filePath);
  const rule = ARCHITECTURE_RULES[packageName];
  if (!rule) {
    return [];
  }

  const violations: ImportViolation[] = [];

  for (const imp of imports) {
    // 1. Check workspace package imports
    if (imp.startsWith('@engine-analyzer/')) {
      // Check for deep/internal imports (e.g. @engine-analyzer/contracts/results)
      const parts = imp.split('/');
      if (parts.length > 2) {
        violations.push({
          filePath,
          packageName,
          importedModule: imp,
          reason: `Deep internal import '${imp}' is strictly forbidden; only public package entry points are permitted.`,
        });
        continue;
      }

      // Check forbidden prefixes
      let isForbidden = false;
      for (const forbidden of rule.forbiddenImports) {
        if (imp === forbidden || imp.startsWith(forbidden + '/')) {
          violations.push({
            filePath,
            packageName,
            importedModule: imp,
            reason: `Package '${packageName}' is strictly forbidden from importing '${imp}'.`,
          });
          isForbidden = true;
          break;
        }
      }
      if (isForbidden) {
        continue;
      }

      // Check allowlist
      if (!rule.allowedImports.includes(imp)) {
        violations.push({
          filePath,
          packageName,
          importedModule: imp,
          reason: `Package '${packageName}' is not allowed to import '${imp}'. Allowed imports: [${rule.allowedImports.join(', ')}].`,
        });
        continue;
      }
    }

    // 2. Check relative imports escaping package boundaries
    if (imp.startsWith('..') || imp.startsWith('.')) {
      const dir = path.dirname(filePath);
      const resolved = path.resolve(dir, imp);
      
      // Compute package directory path
      const packagesDirIndex = filePath.indexOf(path.join('packages', packageName));
      let pkgDir: string;
      if (packagesDirIndex !== -1) {
        pkgDir = path.resolve(filePath.substring(0, packagesDirIndex + path.join('packages', packageName).length));
      } else {
        pkgDir = path.resolve(filePath.split(path.join('packages', packageName))[0] ?? '', 'packages', packageName);
      }

      // Robust relative containment check: path.relative(pkgDir, resolved)
      const rel = path.relative(pkgDir, resolved);
      const isInside = !rel.startsWith('..') && !path.isAbsolute(rel);

      if (!isInside) {
        violations.push({
          filePath,
          packageName,
          importedModule: imp,
          reason: `Relative import '${imp}' escapes package '${packageName}' directory boundary.`,
        });
      }
    }
  }

  return violations;
}

export function checkDirectoryImports(packagesRoot: string): ImportViolation[] {
  const violations: ImportViolation[] = [];
  if (!fs.existsSync(packagesRoot)) {
    return violations;
  }

  const packageNames = fs.readdirSync(packagesRoot);
  for (const pkgName of packageNames) {
    const pkgSrc = path.join(packagesRoot, pkgName, 'src');
    if (fs.existsSync(pkgSrc)) {
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            const fileViolations = checkFileImports(fullPath, pkgName);
            violations.push(...fileViolations);
          }
        }
      };
      walk(pkgSrc);
    }
  }

  return violations;
}
