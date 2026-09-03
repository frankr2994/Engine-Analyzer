import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@engine-analyzer/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@engine-analyzer/contracts/": path.resolve(__dirname, "packages/contracts/src") + "/",
      "@engine-analyzer/validation": path.resolve(__dirname, "packages/validation/src/index.ts"),
      "@engine-analyzer/validation/": path.resolve(__dirname, "packages/validation/src") + "/",
      "@engine-analyzer/calibration": path.resolve(__dirname, "packages/calibration/src/index.ts"),
      "@engine-analyzer/calibration/": path.resolve(__dirname, "packages/calibration/src") + "/",
      "@engine-analyzer/kinematics": path.resolve(__dirname, "packages/kinematics/src/index.ts"),
      "@engine-analyzer/kinematics/": path.resolve(__dirname, "packages/kinematics/src") + "/",
      "@engine-analyzer/baseline-engine": path.resolve(__dirname, "packages/baseline-engine/src/index.ts"),
      "@engine-analyzer/baseline-engine/": path.resolve(__dirname, "packages/baseline-engine/src") + "/",
      "@engine-analyzer/orchestrator": path.resolve(__dirname, "packages/orchestrator/src/index.ts"),
      "@engine-analyzer/orchestrator/": path.resolve(__dirname, "packages/orchestrator/src") + "/",
      "@engine-analyzer/plugins": path.resolve(__dirname, "packages/plugins/src/index.ts"),
      "@engine-analyzer/plugins/": path.resolve(__dirname, "packages/plugins/src") + "/",
      "@engine-analyzer/animation": path.resolve(__dirname, "packages/animation/src/index.ts"),
      "@engine-analyzer/animation/": path.resolve(__dirname, "packages/animation/src") + "/",
      "@engine-analyzer/presentation": path.resolve(__dirname, "packages/presentation/src/index.ts"),
      "@engine-analyzer/presentation/": path.resolve(__dirname, "packages/presentation/src") + "/",
      "@engine-analyzer/plugin-two-stroke": path.resolve(__dirname, "packages/plugin-two-stroke/src/index.ts"),
      "@engine-analyzer/plugin-two-stroke/": path.resolve(__dirname, "packages/plugin-two-stroke/src") + "/",
      "@engine-analyzer/composition-root": path.resolve(__dirname, "packages/composition-root/src/index.ts"),
      "@engine-analyzer/composition-root/": path.resolve(__dirname, "packages/composition-root/src") + "/",
    },
  },
});
