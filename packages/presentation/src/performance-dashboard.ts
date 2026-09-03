import { PerformanceSummary, SimulationResultV1 } from '@engine-analyzer/contracts';

export interface DashboardMetricCard {
  readonly label: string;
  readonly value: number | string;
  readonly unit: string;
  readonly category: 'power' | 'efficiency' | 'pressure' | 'fuel';
}

export class PerformanceDashboardComponent {
  constructor(private readonly simulationResult: SimulationResultV1) {}

  public getMetricCards(): readonly DashboardMetricCard[] {
    const s = this.simulationResult.summary;
    return [
      { label: 'Brake Power', value: s.brakePowerKw, unit: 'kW', category: 'power' },
      { label: 'Indicated Power', value: s.indicatedPowerKw, unit: 'kW', category: 'power' },
      { label: 'Brake Torque', value: s.brakeTorqueNm, unit: 'Nm', category: 'power' },
      { label: 'Indicated Torque', value: s.indicatedTorqueNm, unit: 'Nm', category: 'power' },
      { label: 'BMEP', value: s.bmepBar, unit: 'bar', category: 'pressure' },
      { label: 'IMEP', value: s.imepBar, unit: 'bar', category: 'pressure' },
      { label: 'FMEP', value: s.fmepBar, unit: 'bar', category: 'pressure' },
      { label: 'Brake Thermal Efficiency', value: s.brakeThermalEfficiencyPct, unit: '%', category: 'efficiency' },
      { label: 'Indicated Thermal Efficiency', value: s.indicatedThermalEfficiencyPct, unit: '%', category: 'efficiency' },
      { label: 'Mechanical Efficiency', value: s.mechanicalEfficiencyPct, unit: '%', category: 'efficiency' },
      { label: 'BSFC', value: s.specificFuelConsumptionGBhpKwh, unit: 'g/kWh', category: 'fuel' },
      { label: 'Fuel / Cycle', value: s.fuelMassPerCycleG, unit: 'g', category: 'fuel' },
    ];
  }

  public renderHtml(): string {
    const cards = this.getMetricCards();
    const cardsHtml = cards
      .map(
        (c) => `<div style="background: #212529; padding: 12px 16px; border-radius: 6px; min-width: 140px; margin: 6px;">
          <div style="font-size: 11px; color: #868e96; text-transform: uppercase;">${c.label}</div>
          <div style="font-size: 20px; font-weight: bold; color: #f8f9fa; margin-top: 4px;">
            ${c.value} <span style="font-size: 12px; font-weight: normal; color: #adb5bd;">${c.unit}</span>
          </div>
        </div>`
      )
      .join('');

    return `<div style="display: flex; flex-wrap: wrap; font-family: sans-serif; background: #121214; padding: 12px; border-radius: 8px;">
      ${cardsHtml}
    </div>`;
  }
}
