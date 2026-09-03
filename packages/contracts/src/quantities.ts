/**
 * Physical quantities and units used throughout the engine simulation architecture.
 */

export type QuantityType =
  | 'angle'
  | 'pressure'
  | 'volume'
  | 'temperature'
  | 'length'
  | 'velocity'
  | 'acceleration'
  | 'force'
  | 'torque'
  | 'power'
  | 'energy'
  | 'mass'
  | 'density'
  | 'mass_flow'
  | 'work'
  | 'efficiency'
  | 'ratio'
  | 'frequency'
  | 'specific_fuel_consumption';

export type AngleUnit = 'deg' | 'rad';
export type PressureUnit = 'bar' | 'Pa' | 'kPa' | 'MPa' | 'psi';
export type VolumeUnit = 'cm3' | 'm3' | 'L';
export type TemperatureUnit = 'K' | 'C';
export type LengthUnit = 'mm' | 'm' | 'cm';
export type VelocityUnit = 'm/s' | 'km/h';
export type AccelerationUnit = 'm/s2';
export type ForceUnit = 'N' | 'kN';
export type TorqueUnit = 'Nm';
export type PowerUnit = 'kW' | 'W' | 'hp';
export type EnergyUnit = 'J' | 'kJ';
export type MassUnit = 'g' | 'kg' | 'mg';
export type RatioUnit = 'ratio' | 'fraction' | '%';
export type FrequencyUnit = 'rpm' | 'Hz' | 'rad/s';
export type SpecificFuelConsumptionUnit = 'g/kWh' | 'g/MJ';

export type UnitType =
  | AngleUnit
  | PressureUnit
  | VolumeUnit
  | TemperatureUnit
  | LengthUnit
  | VelocityUnit
  | AccelerationUnit
  | ForceUnit
  | TorqueUnit
  | PowerUnit
  | EnergyUnit
  | MassUnit
  | RatioUnit
  | FrequencyUnit
  | SpecificFuelConsumptionUnit
  | string;

export interface QuantityValue<TUnit extends string = string> {
  readonly value: number;
  readonly unit: TUnit;
  readonly quantity: QuantityType;
}
