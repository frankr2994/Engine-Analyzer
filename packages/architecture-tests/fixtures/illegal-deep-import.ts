// Deliberately illegal fixture: importing internal module instead of public contract entry point
import { SimulationResultV1 } from '@engine-analyzer/contracts/results';

export interface BadDeepImport {
  result: SimulationResultV1;
}
