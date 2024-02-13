import { AgreementOptions } from "./agreement";
import { AgreementSelector, AgreementServiceOptions } from "./service";
import { Logger } from "../utils";
import { randomAgreementSelectorWithPriorityForExistingOnes } from "./strategy";

const DEFAULTS = {
  agreementRequestTimeout: 30000,
  agreementWaitingForApprovalTimeout: 60,
  agreementSelector: randomAgreementSelectorWithPriorityForExistingOnes(),
  agreementMaxEvents: 100,
  agreementEventsFetchingIntervalSec: 5,
  agreementMaxPoolSize: 5,
};

/**
 * @internal
 */
export class AgreementConfig {
  readonly agreementRequestTimeout: number;
  readonly agreementWaitingForApprovalTimeout: number;
  readonly logger?: Logger;
  readonly eventTarget?: EventTarget;

  constructor(public readonly options?: AgreementOptions) {
    this.agreementRequestTimeout = options?.agreementRequestTimeout || DEFAULTS.agreementRequestTimeout;
    this.agreementWaitingForApprovalTimeout =
      options?.agreementWaitingForApprovalTimeout || DEFAULTS.agreementWaitingForApprovalTimeout;
    this.logger = options?.logger;
    this.eventTarget = options?.eventTarget;
  }
}

/**
 * @internal
 */
export class AgreementServiceConfig extends AgreementConfig {
  readonly agreementSelector: AgreementSelector;
  readonly agreementMaxEvents: number;
  readonly agreementMaxPoolSize: number;
  readonly agreementEventsFetchingIntervalSec: number;

  constructor(options?: AgreementServiceOptions) {
    super(options);
    this.agreementSelector = options?.agreementSelector ?? DEFAULTS.agreementSelector;
    this.agreementMaxEvents = options?.agreementMaxEvents ?? DEFAULTS.agreementMaxEvents;
    this.agreementMaxPoolSize = options?.agreementMaxPoolSize ?? DEFAULTS.agreementMaxPoolSize;
    this.agreementEventsFetchingIntervalSec =
      options?.agreementEventsFetchingIntervalSec ?? DEFAULTS.agreementEventsFetchingIntervalSec;
  }
}
