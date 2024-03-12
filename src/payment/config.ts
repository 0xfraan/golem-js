import { AllocationOptions } from "./allocation";
import { EnvUtils, Logger, defaultLogger, YagnaOptions } from "../utils";
import { DebitNoteFilter, InvoiceFilter, PaymentOptions } from "./service";
import { InvoiceOptions } from "./invoice";
import { acceptAllDebitNotesFilter, acceptAllInvoicesFilter } from "./strategy";
import { GolemConfigError } from "../error/golem-error";

const DEFAULTS = Object.freeze({
  payment: { network: "goerli", driver: "erc20" },
  budget: 1.0,
  paymentTimeout: 1000 * 60, // 1 min
  allocationExpirationSec: 60 * 60, // 60 min
  invoiceReceiveTimeout: 1000 * 60 * 5, // 5 min
  maxInvoiceEvents: 500,
  maxDebitNotesEvents: 500,
  invoiceFetchingInterval: 5_000,
  debitNotesFetchingInterval: 5_000,
  unsubscribeTimeoutMs: 10_000,
  debitNoteFilter: acceptAllDebitNotesFilter(),
  invoiceFilter: acceptAllInvoicesFilter(),
});

export interface BasePaymentOptions {
  yagnaOptions?: YagnaOptions;
  budget?: number;
  payment?: { driver?: string; network?: string };
  paymentTimeout?: number;
  paymentRequestTimeout?: number;
  unsubscribeTimeoutMs?: number;
  logger?: Logger;
  eventTarget?: EventTarget;
}
/**
 * @internal
 */
abstract class BaseConfig {
  public readonly paymentTimeout: number;
  public readonly eventTarget?: EventTarget;
  public readonly payment: { driver: string; network: string };
  public readonly options?: BasePaymentOptions;
  public readonly logger: Logger;

  constructor(options?: BasePaymentOptions) {
    this.options = options;
    this.paymentTimeout = options?.paymentTimeout || DEFAULTS.paymentTimeout;
    this.payment = {
      driver: options?.payment?.driver || DEFAULTS.payment.driver,
      network: options?.payment?.network || EnvUtils.getPaymentNetwork() || DEFAULTS.payment.network,
    };
    this.logger = options?.logger || defaultLogger("payment");
    this.eventTarget = options?.eventTarget;
  }
}
/**
 * @internal
 */
export class PaymentConfig extends BaseConfig {
  public readonly invoiceFetchingInterval: number;
  public readonly debitNotesFetchingInterval: number;
  public readonly maxInvoiceEvents: number;
  public readonly maxDebitNotesEvents: number;
  public readonly unsubscribeTimeoutMs: number;
  public readonly debitNoteFilter: DebitNoteFilter;
  public readonly invoiceFilter: InvoiceFilter;

  constructor(options?: PaymentOptions) {
    super(options);
    this.invoiceFetchingInterval = options?.invoiceFetchingInterval ?? DEFAULTS.invoiceFetchingInterval;
    this.debitNotesFetchingInterval = options?.debitNotesFetchingInterval ?? DEFAULTS.debitNotesFetchingInterval;
    this.maxInvoiceEvents = options?.maxInvoiceEvents ?? DEFAULTS.maxInvoiceEvents;
    this.maxDebitNotesEvents = options?.maxDebitNotesEvents ?? DEFAULTS.maxDebitNotesEvents;
    this.unsubscribeTimeoutMs = options?.unsubscribeTimeoutMs ?? DEFAULTS.unsubscribeTimeoutMs;
    this.debitNoteFilter = options?.debitNotesFilter ?? DEFAULTS.debitNoteFilter;
    this.invoiceFilter = options?.invoiceFilter ?? DEFAULTS.invoiceFilter;
  }
}
/**
 * @internal
 */
export class AllocationConfig extends BaseConfig {
  public readonly budget: number;
  public readonly payment: { driver: string; network: string };
  public readonly expirationSec: number;
  public readonly account: { address: string; platform: string };

  constructor(options?: AllocationOptions) {
    super(options);

    if (!options || !options?.account) {
      throw new GolemConfigError("Account option is required");
    }

    if (!options.account.address || !options.account.platform) {
      throw new GolemConfigError("Account address and payment platform are required");
    }

    this.account = options.account;
    this.budget = options?.budget || DEFAULTS.budget;

    this.payment = {
      driver: options?.payment?.driver || DEFAULTS.payment.driver,
      network: options?.payment?.network || DEFAULTS.payment.network,
    };

    this.expirationSec = options?.expirationSec || DEFAULTS.allocationExpirationSec;
  }
}
/**
 * @internal
 */
export class InvoiceConfig extends BaseConfig {
  constructor(options?: InvoiceOptions) {
    super(options);
  }
}
