# Project Handoff

## [2026-09-03T01:48:11.052Z] feat: add semantic validation to calibration and simulation schemas

- Enforce monotonicity and length equality on 1D tables via zod superRefine
- Add `superRefine` to CrankAngleGrid for positive sampleCount and finite values
- Recompute channel min/max from raw data instead of trusting stored fields
- Guard crank calculations against non-finite dimensions before geometry operations
- Validate rod length >= |crank radius + wrist-pin offset| with refinement tests
- Add `INCOMPATIBLE_PLUGIN` and version mismatch error codes to result validation
