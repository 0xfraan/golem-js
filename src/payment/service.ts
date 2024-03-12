import { Logger, sleep, YagnaApi } from "../utils";
import { Allocation, AllocationOptions } from "./allocation";
import { BasePaymentOptions, PaymentConfig } from "./config";
import { Invoice, InvoiceDTO } from "./invoice";
import { DebitNote, DebitNoteDTO } from "./debit_note";
import { DebitNoteEvent, InvoiceEvent, EVENT_PAYMENT_RECEIVED, Payments } from "./payments";
import { Agreement } from "../agreement";
import { AgreementPaymentProcess } from "./agreement_payment_process";
import { GolemPaymentError, PaymentErrorCode } from "./error";
import { EventEmitter } from "eventemitter3";

export interface PaymentServiceEvents {
  /**
   * Triggered when the service encounters an issue in an "asynchronous sub-process"  (like accepting payments)
   * that should be notified to the caller
   *
   * @param err The error raised during an asynchronous process executed by the PaymentService
   */
  error: (err: Error) => void;
}

export interface PaymentOptions extends BasePaymentOptions {
  /** Interval for checking new invoices */
  invoiceFetchingInterval?: number;
  /** Interval for checking new debit notes */
  debitNotesFetchingInterval?: number;
  /** Maximum number of invoice events per one fetching */
  maxInvoiceEvents?: number;
  /** Maximum number of debit notes events per one fetching */
  maxDebitNotesEvents?: number;
  /** A custom filter that checks every debit notes coming from providers */
  debitNotesFilter?: DebitNoteFilter;
  /** A custom filter that checks every invoices coming from providers */
  invoiceFilter?: InvoiceFilter;
}

export type DebitNoteFilter = (debitNote: DebitNoteDTO) => Promise<boolean> | boolean;
export type InvoiceFilter = (invoice: InvoiceDTO) => Promise<boolean> | boolean;

/**
 * Payment Service
 * @description Service used in {@link TaskExecutor}
 * @internal
 */
export class PaymentService {
  public readonly config: PaymentConfig;
  private isRunning = false;
  private logger: Logger;
  private allocation?: Allocation;
  private processes: Map<string, AgreementPaymentProcess> = new Map();
  private payments?: Payments;

  public events = new EventEmitter<PaymentServiceEvents>();

  constructor(
    private readonly yagnaApi: YagnaApi,
    options?: PaymentOptions,
  ) {
    this.config = new PaymentConfig(options);
    this.logger = this.config.logger;
  }

  async run() {
    this.isRunning = true;
    this.payments = await Payments.create(this.yagnaApi, this.config.options);
    this.payments.addEventListener(EVENT_PAYMENT_RECEIVED, this.subscribePayments.bind(this));
    this.logger.info("Payment Service has started");
  }

  async end() {
    if (this.processes.size) {
      this.logger.info(`Waiting for all agreement processes to be completed.`, {
        numberOfProcesses: this.processes.size,
      });
      let timeout = false;
      const timeoutId = setTimeout(() => (timeout = true), this.config.paymentTimeout);
      let i = 0;
      while (this.isRunning && !timeout) {
        const numberOfUnpaidAgreements = this.getNumberOfUnpaidAgreements();
        this.isRunning = numberOfUnpaidAgreements !== 0;
        await sleep(2);
        i++;
        if (i > 10) {
          this.logger.info(`Waiting for ${this.processes.size} agreement processes to be completed to be paid...`);
          i = 0;
        }
      }
      clearTimeout(timeoutId);
    }
    this.isRunning = false;
    await this.payments
      ?.unsubscribe()
      .catch((error) => this.logger.warn("Unable to unsubscribe from payments", { error }));
    this.payments?.removeEventListener(EVENT_PAYMENT_RECEIVED, this.subscribePayments.bind(this));
    await this.allocation?.release().catch((error) => this.logger.warn("Unable to release allocation", { error }));
    this.logger.info("Allocation has been released");
    this.logger.info("Payment service has been stopped");
  }

  /**
   * Create a new allocation that will be used to settle payments for activities
   *
   * @param options Additional options to apply on top of the ones provided in the constructor
   */
  async createAllocation(options?: Partial<AllocationOptions>): Promise<Allocation> {
    try {
      const account = {
        platform: this.getPaymentPlatform(),
        address: await this.getPaymentAddress(),
      };
      this.allocation = await Allocation.create(this.yagnaApi, { ...this.config.options, account, ...options });
      return this.allocation;
    } catch (error) {
      if (error instanceof GolemPaymentError) {
        throw error;
      }
      throw new GolemPaymentError(
        `Unable to create allocation for driver/network ${this.config.payment.driver}/${this.config.payment.network}. ${error}`,
        PaymentErrorCode.AllocationCreationFailed,
        undefined,
        undefined,
        error,
      );
    }
  }

  acceptPayments(agreement: Agreement) {
    this.logger.debug(`Starting to accept payments`, { agreementId: agreement.id });

    if (this.processes.has(agreement.id)) {
      this.logger.warn("Payment process has already been started for this agreement", { agreementId: agreement.id });
      return;
    }

    if (!this.allocation) {
      throw new GolemPaymentError(
        "You need to create an allocation before starting any payment processes",
        PaymentErrorCode.MissingAllocation,
        undefined,
        agreement.getProviderInfo(),
      );
    }

    this.processes.set(
      agreement.id,
      new AgreementPaymentProcess(
        agreement,
        this.allocation,
        {
          invoiceFilter: this.config.invoiceFilter,
          debitNoteFilter: this.config.debitNoteFilter,
        },
        this.logger,
      ),
    );
  }

  private getNumberOfUnpaidAgreements() {
    const inProgress = [...this.processes.values()].filter((p) => !p.isFinished());

    return inProgress.length;
  }

  private async processInvoice(invoice: Invoice) {
    this.logger.debug(`Attempting to process Invoice event`, {
      invoiceId: invoice.id,
      agreementId: invoice.agreementId,
    });
    const process = this.processes.get(invoice.agreementId);

    // This serves two purposes:
    // 1. We will only process invoices which have a payment process started
    // 2. Indirectly, we reject invoices from agreements that we didn't create (TODO: guard this business rule elsewhere)
    if (!process) {
      throw new GolemPaymentError(
        "No payment process was initiated for this agreement - did you forget to use 'acceptPayments' or that's not your invoice?",
        PaymentErrorCode.PaymentProcessNotInitialized,
        this.allocation,
        invoice.provider,
      );
    }

    await process.addInvoice(invoice);
  }

  private async processDebitNote(debitNote: DebitNote) {
    this.logger.debug(`Attempting to process DebitNote event`, {
      debitNoteId: debitNote.id,
      agreementId: debitNote.agreementId,
    });
    const process = this.processes.get(debitNote.agreementId);

    // This serves two purposes:
    // 1. We will only process debit-notes which have a payment process started
    // 2. Indirectly, we reject debit-notes from agreements that we didn't create (TODO: guard this business rule elsewhere)
    if (!process) {
      throw new GolemPaymentError(
        "No payment process was initiated for this agreement - did you forget to use 'acceptPayments' or that's not your debit note?",
        PaymentErrorCode.PaymentProcessNotInitialized,
        this.allocation,
        debitNote.provider,
      );
    }

    await process.addDebitNote(debitNote);
  }

  private async subscribePayments(event: Event) {
    if (event instanceof InvoiceEvent) {
      try {
        await this.processInvoice(event.invoice);
        this.logger.debug(`Invoice event processed`, { agreementId: event.invoice.agreementId });
      } catch (err) {
        this.logger.error(`Failed to process InvoiceEvent`, { agreementId: event.invoice.agreementId, err });
        this.events.emit("error", err);
      }
    }

    if (event instanceof DebitNoteEvent) {
      try {
        await this.processDebitNote(event.debitNote);
        this.logger.debug(`DebitNote event processed`, { agreementId: event.debitNote.agreementId });
      } catch (err) {
        this.logger.error(`Failed to process DebitNoteEvent`, { agreementId: event.debitNote.agreementId, err });
        this.events.emit("error", err);
      }
    }
  }

  private getPaymentPlatform() {
    const mainnets = ["polygon", "mainnet"];
    const token = mainnets.includes(this.config.payment.network) ? "glm" : "tglm";

    return `${this.config.payment.driver}-${this.config.payment.network}-${token}`;
  }

  private async getPaymentAddress(): Promise<string> {
    const data = await this.yagnaApi.identity.getIdentity();
    return data.identity;
  }
}
