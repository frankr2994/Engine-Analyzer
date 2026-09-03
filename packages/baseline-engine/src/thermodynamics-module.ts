import {
  CalculationModule,
  CalculationResultV1,
  Diagnostic,
  deepFreeze,
} from '@engine-analyzer/contracts';

export interface ThermodynamicsInput {
  readonly displacementVolumeCm3: number;
  readonly clearanceVolumeCm3: number;
  readonly volumeSamples: readonly number[];
  readonly sampleAngles: readonly number[];
  readonly massFractionBurned: readonly number[];
  readonly intakePressureBar: number;
  readonly intakeTemperatureK: number;
  readonly gammaCompression: number;
  readonly gammaExpansion: number;
  readonly fuelEnergyPerCycleJ: number;
  readonly trappedAirFuelMassG: number;
}

export interface ThermodynamicsOutput {
  readonly cylinderPressureBar: readonly number[];
  readonly inCylinderTempK: readonly number[];
  readonly peakPressureBar: number;
  readonly peakTemperatureK: number;
  readonly angleAtPeakPressureDeg: number;
}

export class OttoThermodynamicsModule implements CalculationModule<ThermodynamicsInput, ThermodynamicsOutput> {
  public readonly id = 'module.thermodynamics.four-stroke-otto';
  public readonly modelVersion = '1.0.0';
  public readonly schemaVersion = 'calculation-result/1';

  public calculate(input: ThermodynamicsInput): CalculationResultV1<ThermodynamicsOutput> {
    const {
      displacementVolumeCm3,
      clearanceVolumeCm3,
      volumeSamples,
      sampleAngles,
      massFractionBurned,
      intakePressureBar,
      intakeTemperatureK,
      gammaCompression,
      gammaExpansion,
      fuelEnergyPerCycleJ,
      trappedAirFuelMassG,
    } = input;

    const vBdc = clearanceVolumeCm3 + displacementVolumeCm3;
    const vTdc = clearanceVolumeCm3;
    const specificHeatCv = 718.0; // J/(kg*K) for air/fuel mixture approx
    const rSpecAir = 287.05;
    const trappedMassKg = trappedAirFuelMassG * 1e-3;

    const pressureBar: number[] = [];
    const temperatureK: number[] = [];
    let maxP = 0;
    let maxT = 0;
    let angleAtMaxP = 0;

    // Effective trapped charge pressure scaling from volumetric efficiency / trapped mass:
    const pChargeBar = Math.min(
      intakePressureBar * 1.5,
      Math.max(
        0.3,
        (trappedMassKg * rSpecAir * intakeTemperatureK) / (displacementVolumeCm3 * 1e-6 * 1e5 * (1 + 1 / 14.7))
      )
    );

    // First, find state at end of compression (TDC firing at 720 deg / 0 deg)
    const pCompTdc = pChargeBar * Math.pow(vBdc / vTdc, gammaCompression);
    const tCompTdc = intakeTemperatureK * Math.pow(vBdc / vTdc, gammaCompression - 1.0);

    // Delta T from full heat release: deltaT = Q_in / (m * Cv)
    const deltaTTotal = fuelEnergyPerCycleJ / (trappedMassKg * specificHeatCv);
    // Constant volume pressure multiplier with realistic real-engine losses (dissociation, wall heat transfer, finite burn):
    const deltaPCombustion = pCompTdc * (deltaTTotal / tCompTdc) * 0.44;

    for (let i = 0; i < sampleAngles.length; i++) {
      const theta = sampleAngles[i] ?? 0;
      const v = volumeSamples[i] ?? vTdc;
      const xb = massFractionBurned[i] ?? 0;

      let p = intakePressureBar;
      let t = intakeTemperatureK;

      if (theta >= 0 && theta < 180) {
        // Power / Expansion stroke (0..180 deg)
        // Heat transfer to cylinder walls and exhaust blowdown
        const heatLossFactor = 1.0 - 0.22 * (theta / 180.0);
        const evoBlowdown = theta > 140 ? Math.max(0.3, 1.0 - 0.7 * ((theta - 140) / 40.0)) : 1.0;
        const pStart = pCompTdc + deltaPCombustion;
        const tStart = tCompTdc + deltaTTotal * 0.75;
        p = pStart * Math.pow(vTdc / v, gammaExpansion) * heatLossFactor * evoBlowdown;
        t = tStart * Math.pow(vTdc / v, gammaExpansion - 1.0) * heatLossFactor;
        // Blend with burning fraction if combustion still completing near TDC
        if (xb < 1.0) {
          const pMotored = pChargeBar * Math.pow(vBdc / v, gammaCompression);
          p = pMotored + deltaPCombustion * xb * Math.pow(vTdc / v, gammaExpansion) * heatLossFactor;
        }
      } else if (theta >= 180 && theta < 360) {
        // Exhaust stroke (180..360 deg)
        p = 1.08; // slightly above ambient
        t = 650.0;
      } else if (theta >= 360 && theta < 540) {
        // Intake stroke (360..540 deg)
        p = intakePressureBar * 0.98; // throttling/manifold pressure
        t = intakeTemperatureK;
      } else {
        // Compression stroke (540..720 deg)
        const pMotored = pChargeBar * Math.pow(vBdc / v, gammaCompression);
        const tMotored = intakeTemperatureK * Math.pow(vBdc / v, gammaCompression - 1.0);
        // Add combustion pressure rise if spark occurred before 720 deg
        p = pMotored + deltaPCombustion * xb;
        t = tMotored + deltaTTotal * xb;
      }

      pressureBar.push(p);
      temperatureK.push(t);

      if (p > maxP) {
        maxP = p;
        angleAtMaxP = theta;
      }
      if (t > maxT) {
        maxT = t;
      }
    }

    const diagnostics: Diagnostic[] = [
      {
        code: 'INFO_THERMO_COMPUTED',
        message: `Otto thermodynamics computed: Peak Pressure = ${maxP.toFixed(2)} bar at ${angleAtMaxP} deg. Peak Temp = ${maxT.toFixed(0)} K.`,
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
        cylinderPressureBar: pressureBar,
        inCylinderTempK: temperatureK,
        peakPressureBar: maxP,
        peakTemperatureK: maxT,
        angleAtPeakPressureDeg: angleAtMaxP,
      },
      diagnostics,
    });
  }
}
