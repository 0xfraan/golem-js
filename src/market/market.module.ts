import { EventEmitter } from "eventemitter3";
import { DemandConfig, DemandNew, DraftOfferProposalPool, MarketApi, NewProposalEvent } from "./index";
import {
  Agreement,
  LeaseProcess,
  IPaymentApi,
  IActivityApi,
  LeaseProcessPool,
  LeaseProcessPoolOptions,
} from "../agreement";
import { defaultLogger, Logger, YagnaApi } from "../shared/utils";
import { Allocation } from "../payment";
import { Package } from "./package";
import { bufferTime, filter, map, Observable, switchMap, tap, OperatorFunction } from "rxjs";
import { IProposalRepository, ProposalNew } from "./proposal";
import { ComparisonOperator, DecorationsBuilder } from "./builder";
import { ProposalFilterNew } from "./service";
import { IAgreementApi } from "../agreement/agreement";
import { DemandOptionsNew, DemandSpecification, IDemandRepository } from "./demand";
import { ProposalsBatch } from "./proposals_batch";
import { PayerDetails } from "../payment/PayerDetails";
import { IFileServer } from "../activity";
import { StorageProvider } from "../shared/storage";

export interface MarketEvents {}

/**
 * Use by legacy demand publishing code
 */
export interface DemandBuildParams {
  demand: DemandOptionsNew;
  market: MarketOptions;
}

export type DemandEngine = "vm" | "vm-nvidia" | "wasmtime";

export type PaymentSpec = {
  network: string;
  driver: "erc20";
  token?: "glm" | "tglm";
};

/**
 * Represents the new demand specification which is accepted by GolemNetwork and MarketModule
 */
export interface DemandSpec {
  demand: DemandOptionsNew;
  market: MarketOptions;
  payment: PaymentSpec;
}

export interface DemandResources {
  /** The minimum CPU requirement for each service instance. */
  minCpu: number;

  /* The minimum memory requirement (in Gibibyte) for each service instance. */
  minMemGib: number;

  /** The minimum storage requirement (in Gibibyte) for each service instance. */
  minStorageGib: number;
}

export interface MarketOptions {
  /** How long you want to rent the resources in hours */
  rentHours?: number;

  pricing?: {
    maxStartPrice: number;
    maxCpuPerHourPrice: number;
    maxEnvPerHourPrice: number;
  };

  /** The payment network that should be considered while looking for providers and where payments will be done */
  paymentNetwork?: string;

  /**
   * List of provider Golem Node IDs that should be considered
   *
   * If not provided, the list will be pulled from: https://provider-health.golem.network/v1/provider-whitelist
   */
  withProviders?: string[];
  withoutProviders?: string[];
  withOperators?: string[];
  withoutOperators?: string[];
}

export interface MarketModule {
  events: EventEmitter<MarketEvents>;

  /**
   * Build a DemandSpecification based on the given options and payer details.
   * You can obtain the payer details from the payment module.
   * The method returns a DemandSpecification that can be used to publish the demand to the market,
   * for example using the `publishDemand` method.
   */
  buildDemand(options: DemandOptionsNew, payerDetails: PayerDetails): Promise<DemandSpecification>;

  /**
   * Publishes the demand to the market and handles refreshing it when needed.
   * Each time the demand is refreshed, a new demand is emitted by the observable.
   * Keep in mind that since this method returns an observable, nothing will happen until you subscribe to it.
   * Unsubscribing will remove the demand from the market.
   */
  publishDemand(offer: DemandSpecification): Observable<DemandNew>;

  /**
   * Subscribes to the proposals for the given demand.
   * If an error occurs, the observable will emit an error and complete.
   * Keep in mind that since this method returns an observable, nothing will happen until you subscribe to it.
   */
  subscribeForProposals(demand: DemandNew): Observable<ProposalNew>;

  /**
   * Sends a counter-offer to the provider. Note that to get the provider's response to your
   * counter you should listen to proposals sent to yagna using `subscribeForProposals`.
   */
  negotiateProposal(receivedProposal: ProposalNew, offer: DemandSpecification): Promise<ProposalNew>;

  /**
   * Internally
   *
   * - ya-ts-client createAgreement
   * - ya-ts-client approveAgreement
   * - ya-ts-client "wait for approval"
   *
   * @param proposal
   *
   * @return Returns when the provider accepts the agreement, rejects otherwise. The resulting agreement is ready to create activities from.
   */
  proposeAgreement(proposal: ProposalNew): Promise<Agreement>;

  /**
   * @return The Agreement that has been terminated via Yagna
   */
  terminateAgreement(agreement: Agreement, reason?: string): Promise<Agreement>;

  /**
   * Creates a demand for the given package and allocation and starts collecting, filtering and negotiating proposals.
   * The method returns an observable that emits a batch of draft proposals every time the buffer is full.
   * The method will automatically negotiate the proposals until they are moved to the `Draft` state.
   * Keep in mind that since this method returns an observable, nothing will happen until you subscribe to it.
   * Unsubscribing from the observable will stop the process and remove the demand from the market.
   */
  startCollectingProposals(options: {
    demandSpecification: DemandSpecification;
    filter?: ProposalFilterNew;
    bufferSize?: number;
  }): Observable<ProposalNew[]>;

  createLease(agreement: Agreement, allocation: Allocation): LeaseProcess;

  /**
   * Factory that creates new agreement pool that's fully configured
   */
  createLeaseProcessPool(
    draftPool: DraftOfferProposalPool,
    allocation: Allocation,
    options?: LeaseProcessPoolOptions,
  ): LeaseProcessPool;
}

export class MarketModuleImpl implements MarketModule {
  events: EventEmitter<MarketEvents> = new EventEmitter<MarketEvents>();

  private readonly yagnaApi: YagnaApi;
  private readonly logger = defaultLogger("market");
  private readonly agreementApi: IAgreementApi;
  private readonly proposalRepo: IProposalRepository;
  private readonly demandRepo: IDemandRepository;
  private fileServer: IFileServer;

  private defaultDemandExpirationSec = 60 * 60;

  constructor(
    private readonly deps: {
      logger: Logger;
      yagna: YagnaApi;
      agreementApi: IAgreementApi;
      proposalRepository: IProposalRepository;
      demandRepository: IDemandRepository;
      paymentApi: IPaymentApi;
      activityApi: IActivityApi;
      marketApi: MarketApi;
      fileServer: IFileServer;
      storageProvider: StorageProvider;
    },
  ) {
    this.logger = deps.logger;
    this.yagnaApi = deps.yagna;
    this.agreementApi = deps.agreementApi;
    this.proposalRepo = deps.proposalRepository;
    this.demandRepo = deps.demandRepository;
    this.fileServer = deps.fileServer;
  }

  async buildDemand(options: DemandOptionsNew, payerDetails: PayerDetails): Promise<DemandSpecification> {
    const demandSpecificConfig = new DemandConfig(options);
    const builder = new DecorationsBuilder();

    // Apply additional modifications
    const pkgOptions = await this.applyLocalGVMIServeSupport(options);
    const taskDecorations = await Package.create(pkgOptions).getDemandDecoration();

    builder.addDecorations([taskDecorations]);

    // Configure basic properties
    builder
      .addProperty("golem.srv.caps.multi-activity", true)
      .addProperty("golem.srv.comp.expiration", Date.now() + demandSpecificConfig.expirationSec * 1000)
      .addProperty("golem.node.debug.subnet", demandSpecificConfig.subnetTag)
      .addProperty("golem.com.payment.debit-notes.accept-timeout?", demandSpecificConfig.debitNotesAcceptanceTimeoutSec)
      .addConstraint("golem.com.pricing.model", "linear")
      .addConstraint("golem.node.debug.subnet", demandSpecificConfig.subnetTag);

    // Configure mid-agreement payments
    builder
      .addProperty(
        "golem.com.scheme.payu.debit-note.interval-sec?",
        demandSpecificConfig.midAgreementDebitNoteIntervalSec,
      )
      .addProperty("golem.com.scheme.payu.payment-timeout-sec?", demandSpecificConfig.midAgreementPaymentTimeoutSec);

    // Configure payment platform
    builder
      .addProperty(`golem.com.payment.platform.${payerDetails.getPaymentPlatform()}.address`, payerDetails.address)
      .addProperty("golem.com.payment.protocol.version", "2")
      .addConstraint(`golem.com.payment.platform.${payerDetails.getPaymentPlatform()}.address`, "*")
      .addConstraint("golem.com.payment.protocol.version", "1", ComparisonOperator.Gt);

    return builder.getDemandSpecification(payerDetails.getPaymentPlatform(), demandSpecificConfig.expirationSec);
  }

  /**
   * Augments the user-provided options with additional logic
   *
   * Use Case: serve the GVMI from the requestor and avoid registry
   */
  private async applyLocalGVMIServeSupport(options: DemandOptionsNew) {
    if (options.imageUrl?.startsWith("file://")) {
      const sourcePath = options.imageUrl?.replace("file://", "");

      const publishInfo = this.fileServer.getPublishInfo(sourcePath) ?? (await this.fileServer.publishFile(sourcePath));
      const { fileUrl: imageUrl, fileHash: imageHash } = publishInfo;

      this.logger.debug("Applied local GVMI serve support", {
        sourcePath,
        publishInfo,
      });

      return {
        ...options,
        imageUrl,
        imageHash,
      };
    }

    return options;
  }

  publishDemand(demandSpecification: DemandSpecification): Observable<DemandNew> {
    return new Observable<DemandNew>((subscriber) => {
      let currentDemand: DemandNew;

      const subscribeDemand = async () => {
        currentDemand = await this.deps.marketApi.publishDemandSpecification(demandSpecification);
        subscriber.next(currentDemand);
        this.logger.debug("Subscribing for proposals matched with the demand", { demand: currentDemand });
      };
      subscribeDemand();

      const interval = setInterval(() => {
        this.deps.marketApi
          .unpublishDemand(currentDemand)
          .catch((error) => this.logger.error("Failed to unpublish demand", error));
        subscribeDemand();
      }, demandSpecification.expirationSec * 1000);

      return () => {
        clearInterval(interval);
        this.deps.marketApi
          .unpublishDemand(currentDemand)
          .catch((error) => this.logger.error("Failed to unpublish demand", error));
      };
    });
  }

  subscribeForProposals(demand: DemandNew): Observable<ProposalNew> {
    return this.deps.marketApi.observeProposalEvents(demand).pipe(
      // filter out proposal rejection events
      filter((event) => !("reason" in event)),
      // map proposal events to proposal models
      map((event) => new ProposalNew((event as NewProposalEvent).proposal, demand)),
    );
  }

  async negotiateProposal(receivedProposal: ProposalNew, offer: DemandSpecification): Promise<ProposalNew> {
    return this.deps.marketApi.counterProposal(receivedProposal, offer);
  }

  async proposeAgreement(proposal: ProposalNew): Promise<Agreement> {
    const agreement = await this.agreementApi.proposeAgreement(proposal);

    this.logger.info("Proposed and got approval for agreement", {
      agreementId: agreement.id,
      provider: agreement.getProviderInfo(),
    });

    return agreement;
  }

  async terminateAgreement(agreement: Agreement, reason?: string): Promise<Agreement> {
    await this.agreementApi.terminateAgreement(agreement, reason);

    this.logger.info("Terminated agreement", {
      agreementId: agreement.id,
      provider: agreement.getProviderInfo(),
      reason,
    });

    return agreement;
  }

  startCollectingProposals(options: {
    demandSpecification: DemandSpecification;
    filter?: ProposalFilterNew;
    bufferSize?: number;
    bufferTimeout?: number;
    minProposalsBatchSize?: number;
    proposalsBatchReleaseTimeoutMs?: number;
  }): Observable<ProposalNew[]> {
    return this.publishDemand(options.demandSpecification).pipe(
      // for each demand created -> start collecting all proposals
      switchMap((demand) => {
        this.demandRepo.add(demand);
        return this.subscribeForProposals(demand);
      }),
      // for each proposal collected -> filter out undesired and invalid ones
      filter((proposal) => proposal.isValid()),
      filter((proposal) => !options.filter || options.filter(proposal)),
      // for each proposal -> deduplicate them by provider key
      this.reduceInitialProposalsByProviderKey({
        minProposalsBatchSize: options?.minProposalsBatchSize,
        proposalsBatchReleaseTimeoutMs: options?.proposalsBatchReleaseTimeoutMs,
      }),
      // for each valid proposal -> start negotiating if it's not in draft state yet
      tap((proposal) => {
        if (proposal.isInitial()) {
          this.negotiateProposal(proposal, options.demandSpecification);
        }
      }),
      // for each proposal -> add them to the cache
      tap((proposal) => this.proposalRepo.add(proposal)),
      // for each proposal -> filter out all states other than draft
      filter((proposal) => proposal.isDraft()),
      // for each draft proposal -> add them to the buffer
      bufferTime(options.bufferTimeout ?? 1_000, null, options.bufferSize || 10),
      // filter out empty buffers
      filter((proposals) => proposals.length > 0),
    );
  }

  createLease(agreement: Agreement, allocation: Allocation) {
    // TODO Accept the filters
    return new LeaseProcess(
      agreement,
      allocation,
      this.deps.paymentApi,
      this.deps.activityApi,
      this.agreementApi,
      this.deps.logger,
      this.yagnaApi, // TODO: Remove this dependency
      this.deps.storageProvider,
    );
  }

  public createLeaseProcessPool(
    draftPool: DraftOfferProposalPool,
    allocation: Allocation,
    options?: LeaseProcessPoolOptions,
  ): LeaseProcessPool {
    return new LeaseProcessPool({
      agreementApi: this.agreementApi,
      paymentApi: this.deps.paymentApi,
      allocation,
      proposalPool: draftPool,
      marketModule: this,
      logger: options?.logger || this.logger.child("lease-process-pool"),
      ...options,
    });
  }

  /**
   * Reduce initial proposals to a set grouped by the provider's key to avoid duplicate offers
   */
  private reduceInitialProposalsByProviderKey(options?: {
    minProposalsBatchSize?: number;
    proposalsBatchReleaseTimeoutMs?: number;
  }): OperatorFunction<ProposalNew, ProposalNew> {
    return (source) =>
      new Observable((destination) => {
        let isCancelled = false;
        const proposalsBatch = new ProposalsBatch({
          minBatchSize: options?.minProposalsBatchSize,
          releaseTimeoutMs: options?.proposalsBatchReleaseTimeoutMs,
        });
        const subscription = source.subscribe((proposal) => {
          if (proposal.isInitial()) {
            proposalsBatch.addProposal(proposal);
            this.logger.debug("Added initial proposal to batch", { proposal: proposal.id });
          } else {
            destination.next(proposal);
          }
        });
        const batch = async () => {
          if (isCancelled) {
            return;
          }
          this.logger.debug("Waiting for reduced proposals...");
          try {
            await proposalsBatch.waitForProposals();
            const proposals = await proposalsBatch.getProposals();
            this.logger.debug("Received batch of proposals", { count: proposals.length });
            proposals.forEach((proposal) => destination.next(proposal));
          } catch (error) {
            destination.error(error);
          }
          batch();
        };
        batch();
        return () => {
          isCancelled = true;
          subscription.unsubscribe();
        };
      });
  }
}
