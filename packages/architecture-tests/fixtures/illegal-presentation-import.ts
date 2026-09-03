// Deliberately illegal fixture: presentation component directly importing calibration repository
import { InMemoryCalibrationRepository } from '@engine-analyzer/calibration';

export class BadPresentationComponent {
  constructor(private readonly cal: InMemoryCalibrationRepository) {}
}
