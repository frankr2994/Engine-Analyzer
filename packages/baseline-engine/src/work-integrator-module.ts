import {
  CalculationModule,
  CalculationResultV1,
  Diagnostic,
  PerformanceSummary,
  deepFreeze,
} from '@engine-analyzer/contracts';

export interface WorkIntegratorInput {
  readonly displacementVolumeCm3: number;
  readonly cylinderCount: number;
  readonly rpm: number;
  readonly pressureSamplesBar: readonly number[];
  readonly volumeSamplesCm3: readonly number[];
  readonly sampleAnglesDeg: readonly number[];
  readonly pistonPositionMm: readonly number[];
  readonly connectingRodAngleDeg: readonly number[];
  readonly peakPressureBar: number;
  readonly meanPistonSpeedMs: number;
  readonly fuelEnergyPerCycleJ: number;
  readonly fuelMassPerCycleG: number;
  readonly frictionCoeffA: number;
  readonly frictionCoeffB: number;
  readonly frictionCoeffC: number;
  readonly strokeMm: number;
  readonly boreMm: number;
}

export interface WorkIntegratorOutput {
  readonly summary: PerformanceSummary;
  readonly instantaneousTorqueNm: readonly number[];
}

export class WorkIntegratorModule implements CalculationModule<WorkIntegratorInput, WorkIntegratorOutput> {
  public readonly id = 'module.performance.work-integrator';
  public readonly modelVersion = '1.0.0';
  public readonly schemaVersion = 'calculation-result/1';

  public calculate(input: WorkIntegratorInput): CalculationResultV1<WorkIntegratorOutput> {
    const {
      displacementVolumeCm3,
      cylinderCount,
      rpm,
      pressureSamplesBar,
      volumeSamplesCm3,
      sampleAnglesDeg,
      connectingRodAngleDeg,
      peakPressureBar,
      meanPistonSpeedMs,
      fuelEnergyPerCycleJ,
      fuelMassPerCycleG,
      frictionCoeffA,
      frictionCoeffB,
      frictionCoeffC,
      strokeMm,
      boreMm,
    } = input;

    // Trapezoidal numerical integration of P dV over the 720 deg cycle
    // W_ind = integral(P dV) (with P in bar = 10^5 Pa, V in cm^3 = 10^-6 m^3 => P*V is 0.1 Joules)
    let indicatedWorkPerCylJ = 0;
    const n = sampleAnglesDeg.length;

    for (let i = 0; i < n; i++) {
      const nextIdx = (i + 1) % n;
      const p1 = pressureSamplesBar[i] ?? 1.0;
      const p2 = pressureSamplesBar[nextIdx] ?? 1.0;
      const v1 = volumeSamplesCm3[i] ?? 0;
      const v2 = volumeSamplesCm3[nextIdx] ?? 0;

      const pAvg = (p1 + p2) / 2.0;
      const dV = v2 - v1; // cm^3
      indicatedWorkPerCylJ += pAvg * dV * 0.1; // Joules
    }

    const totalIndicatedWorkJ = indicatedWorkPerCylJ * cylinderCount;

    // IMEP (bar) = W_ind (J) / (V_d (m^3) * 10^5) = W_ind / (V_d_cm3 * 0.1)
    const imepBar = indicatedWorkPerCylJ / (displacementVolumeCm3 * 0.1);

    // Chen-Flynn Friction Mean Effective Pressure (FMEP)
    const fmepBar = frictionCoeffA + frictionCoeffB * peakPressureBar + frictionCoeffC * Math.pow(meanPistonSpeedMs, 2);

    // BMEP = IMEP - FMEP
    const bmepBar = Math.max(0.1, imepBar - fmepBar);

    // Indicated Power (kW) = W_total * (RPM / (2 * 60)) / 1000
    // (since 4-stroke engine has 0.5 power cycles per revolution per cylinder)
    const cyclesPerSecond = (rpm / 120.0);
    const indicatedPowerKw = (totalIndicatedWorkJ * cyclesPerSecond) / 1000.0;
    const brakePowerKw = indicatedPowerKw * (bmepBar / imepBar);

    // Torques (Nm) = Power (W) / (2 * pi * (RPM / 60))
    const omega = 2.0 * Math.PI * (rpm / 60.0);
    const indicatedTorqueNm = (indicatedPowerKw * 1000.0) / omega;
    const brakeTorqueNm = (brakePowerKw * 1000.0) / omega;

    // Thermal Efficiencies
    const totalFuelEnergyPerCycleJ = fuelEnergyPerCycleJ * cylinderCount;
    const indicatedThermalEfficiencyPct = (totalIndicatedWorkJ / totalFuelEnergyPerCycleJ) * 100.0;
    const brakeThermalEfficiencyPct = indicatedThermalEfficiencyPct * (bmepBar / imepBar);
    const mechanicalEfficiencyPct = (bmepBar / imepBar) * 100.0;

    // Brake Specific Fuel Consumption (BSFC)
    // Fuel mass flow (g/h) = fuelMassPerCycleG * cylinderCount * (RPM / 120) * 3600
    const fuelMassFlowGHour = fuelMassPerCycleG * cylinderCount * cyclesPerSecond * 3600.0;
    const bsfc = brakePowerKw > 0 ? fuelMassFlowGHour / brakePowerKw : 0;

    // Instantaneous torque across crank angle:
    // Torque(theta) = F_piston * r * (sin(theta) + lambda * sin(2*theta) / (2 * cos(beta)))
    // F_piston = (P(theta) - P_ambient) * A_piston (N)
    const pistonAreaM2 = (Math.PI / 4.0) * Math.pow(boreMm * 1e-3, 2);
    const crankRadiusM = (strokeMm / 2.0) * 1e-3;
    const instantaneousTorqueNm: number[] = [];

    for (let i = 0; i < n; i++) {
      const thetaDeg = sampleAnglesDeg[i] ?? 0;
      const thetaRad = (thetaDeg * Math.PI) / 180.0;
      const betaDeg = connectingRodAngleDeg[i] ?? 0;
      const betaRad = (betaDeg * Math.PI) / 180.0;
      const p = pressureSamplesBar[i] ?? 1.0;
      const netPressurePa = (p - 1.0) * 1e5;
      const fPiston = netPressurePa * pistonAreaM2;

      // Tangential crank force torque: T = F_piston * r * sin(theta + beta) / cos(beta)
      const torque = fPiston * crankRadiusM * (Math.sin(thetaRad + betaRad) / Math.max(0.01, Math.cos(betaRad)));
      instantaneousTorqueNm.push(torque);
    }

    const summary: PerformanceSummary = {
      indicatedPowerKw: Math.round(indicatedPowerKw * 100) / 100,
      brakePowerKw: Math.round(brakePowerKw * 100) / 100,
      indicatedTorqueNm: Math.round(indicatedTorqueNm * 100) / 100,
      brakeTorqueNm: Math.round(brakeTorqueNm * 100) / 100,
      indicatedWorkJ: Math.round(totalIndicatedWorkJ * 10) / 10,
      imepBar: Math.round(imepBar * 100) / 100,
      bmepBar: Math.round(bmepBar * 100) / 100,
      fmepBar: Math.round(fmepBar * 100) / 100,
      indicatedThermalEfficiencyPct: Math.round(indicatedThermalEfficiencyPct * 100) / 100,
      brakeThermalEfficiencyPct: Math.round(brakeThermalEfficiencyPct * 100) / 100,
      mechanicalEfficiencyPct: Math.round(mechanicalEfficiencyPct * 100) / 100,
      fuelMassPerCycleG: Math.round(fuelMassPerCycleG * cylinderCount * 10000) / 10000,
      specificFuelConsumptionGBhpKwh: Math.round(bsfc * 10) / 10,
    };

    const diagnostics: Diagnostic[] = [
      {
        code: 'INFO_WORK_INTEGRATION_COMPUTED',
        message: `Work integration completed: Indicated Power = ${summary.indicatedPowerKw} kW, Brake Power = ${summary.brakePowerKw} kW. IMEP = ${summary.imepBar} bar, BMEP = ${summary.bmepBar} bar.`,
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
        summary,
        instantaneousTorqueNm,
      },
      diagnostics,
    });
  }
}
