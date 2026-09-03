import {
  CalculationModule,
  CalculationResultV1,
  Diagnostic,
  deepFreeze,
} from '@engine-analyzer/contracts';

export interface CombustionInput {
  readonly sparkTimingDegBtdc: number; // e.g. 15 deg BTDC
  readonly combustionDurationDeg: number; // e.g. 45 deg
  readonly fuelEnergyPerCycleJ: number;
  readonly wiebeA: number; // e.g. 5.0
  readonly wiebeM: number; // e.g. 2.0
  readonly sampleAngles: readonly number[];
}

export interface CombustionOutput {
  readonly massFractionBurned: readonly number[];
  readonly heatReleaseRateJDeg: readonly number[];
  readonly peakHeatReleaseRateJDeg: number;
  readonly angleAtPeakHeatReleaseDeg: number;
  readonly angleAt50PercentBurnDeg: number;
}

export class WiebeCombustionModule implements CalculationModule<CombustionInput, CombustionOutput> {
  public readonly id = 'module.combustion.wiebe';
  public readonly modelVersion = '1.0.0';
  public readonly schemaVersion = 'calculation-result/1';

  public calculate(input: CombustionInput): CalculationResultV1<CombustionOutput> {
    const {
      sparkTimingDegBtdc,
      combustionDurationDeg,
      fuelEnergyPerCycleJ,
      wiebeA,
      wiebeM,
      sampleAngles,
    } = input;

    // Spark angle in [0, 720) domain: TDC firing is at 0 deg / 720 deg.
    // Spark occurs at (720 - sparkTimingDegBtdc) deg.
    const startAngle = 720.0 - sparkTimingDegBtdc;
    const duration = combustionDurationDeg;
    const endAngle = startAngle + duration; // Can wrap past 720 (e.g. 705 to 750 => 705 to 30 deg)

    const xbList: number[] = [];
    const hrrList: number[] = [];
    let peakHrr = 0;
    let angleAtPeakHrr = 0;
    let angleAtCa50 = 0;
    let foundCa50 = false;

    for (const theta of sampleAngles) {
      let angleSinceSpark = -1;
      if (theta >= (720.0 - sparkTimingDegBtdc)) {
        angleSinceSpark = theta - (720.0 - sparkTimingDegBtdc);
      } else if (theta < 180.0) {
        angleSinceSpark = theta + sparkTimingDegBtdc;
      }

      let xb = 0.0;
      let hrr = 0.0;

      if (angleSinceSpark >= 0) {
        if (angleSinceSpark < duration) {
          const phi = angleSinceSpark / duration;
          xb = 1.0 - Math.exp(-wiebeA * Math.pow(phi, wiebeM + 1));
          // Derivative dxb/dtheta
          const dxbDtheta =
            (wiebeA * (wiebeM + 1) / duration) *
            Math.pow(phi, wiebeM) *
            Math.exp(-wiebeA * Math.pow(phi, wiebeM + 1));
          hrr = fuelEnergyPerCycleJ * dxbDtheta;
        } else if (theta < 180.0) {
          // Throughout the remainder of the expansion stroke after combustion completes, xb remains 1.0
          xb = 1.0;
          hrr = 0.0;
        }
      }

      xbList.push(Math.max(0, Math.min(1.0, xb)));
      hrrList.push(Math.max(0, hrr));

      if (hrr > peakHrr) {
        peakHrr = hrr;
        angleAtPeakHrr = theta;
      }

      if (!foundCa50 && xb >= 0.5) {
        angleAtCa50 = theta;
        foundCa50 = true;
      }
    }

    const diagnostics: Diagnostic[] = [
      {
        code: 'INFO_COMBUSTION_COMPUTED',
        message: `Wiebe combustion computed: peak HRR = ${peakHrr.toFixed(2)} J/deg at ${angleAtPeakHrr} deg.`,
        level: 'info',
        moduleId: this.id,
        timestamp: new Date().toISOString(),
      },
    ];

    return deepFreeze({
      schemaVersion: 'calculation-result/1',
      module: {
        id: this.id,
        modelVersion: this.modelVersion,
        schemaVersion: this.schemaVersion,
      },
      value: {
        massFractionBurned: xbList,
        heatReleaseRateJDeg: hrrList,
        peakHeatReleaseRateJDeg: peakHrr,
        angleAtPeakHeatReleaseDeg: angleAtPeakHrr,
        angleAt50PercentBurnDeg: angleAtCa50,
      },
      diagnostics,
    });
  }
}
