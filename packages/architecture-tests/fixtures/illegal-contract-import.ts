// Deliberately illegal fixture: contracts importing concrete model
import { BaselineEngineModel } from '@engine-analyzer/baseline-engine';

export interface BadContract {
  model: BaselineEngineModel;
}
