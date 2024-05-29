import { Observable } from "rxjs";
import { Demand, DemandSpecification } from "./demand";
import YaTsClient, { MarketApi } from "ya-ts-client";
import { OfferProposal } from "./offer-proposal";
import { DemandBodyPrototype } from "./demand/demand-body-builder";
import { AgreementEvent } from "./agreement/agreement-event";
import { Agreement } from "./agreement";

export type NewProposalEvent = YaTsClient.MarketApi.ProposalEventDTO;
export type ProposalRejectedEvent = YaTsClient.MarketApi.ProposalRejectedEventDTO;
export type YagnaProposalEvent = NewProposalEvent | ProposalRejectedEvent;

export type DemandOfferEvent =
  | {
      type: "ProposalReceived";
      proposal: OfferProposal;
      timestamp: Date;
    }
  | {
      type: "ProposalRejected";
      proposal: OfferProposal;
      reason: string;
      timestamp: Date;
    }
  | {
      type: "PropertyQueryReceived";
      timestamp: Date;
    };

export interface IMarketEvents {
  subscribedToOfferProposals: (demand: Demand) => void;
  refreshedOfferProposalSubscription: (demand: Demand) => void;
  unsubscribedFromOfferProposals: (demand: Demand) => void;

  propertyQueryReceived: () => void;

  offerProposalReceived: (offerProposal: OfferProposal) => void;
  offerProposalRejectedByFilter: (offerProposal: OfferProposal, reason?: string) => void;

  counterProposalRejectedByProvider: (counterOfferProposal: OfferProposal, reason: string) => void;

  agreementConfirmed: (agreement: Agreement) => void;
  agreementRejected: (agreement: Agreement, reason: string) => void;
  agreementTerminated: (agreement: Agreement, terminatedBy: "Provider" | "Requestor", reason: string) => void;
  agreementCancelled: (agreement: Agreement) => void;
}

export interface IMarketApi {
  /**
   * Creates a new demand based on the given specification and publishes
   * it to the market.
   * Keep in mind that the demand lasts for a limited time and needs to be
   * refreshed periodically (see `refreshDemand` method).
   * Use `unpublishDemand` to remove the demand from the market.
   */
  publishDemandSpecification(specification: DemandSpecification): Promise<Demand>;

  /**
   * Remove the given demand from the market.
   */
  unpublishDemand(demand: Demand): Promise<void>;

  /**
   * Creates a new observable that emits proposal events related to the given demand.
   *
   * @deprecated replaced observeDemandResponse
   */
  observeProposalEvents(demand: Demand): Observable<YagnaProposalEvent>;

  /**
   * "Publishes" the demand on the network and stats to listen (event polling) for the events representing the feedback
   *
   * The feedback can fall into four categories:
   *
   * - (Initial) We will receive initial offer proposals that were matched by the yagna node which we're using
   * - (Negotiations) We will receive responses from providers with draft offer proposals if we decided to counter the initial proposal
   * - (Negotiations) We will receive an event representing rejection of our counter-proposal by the provider
   * - (Negotiations) We will receive a question from the provider about a certain property as part of the negotiation process (_protocol piece not by yagna 0.15_)
   *
   * @param demand
   *
   * @returns A complex object that allows subscribing to these categories of feedback mentioned above
   */
  observeDemandResponse(demand: Demand): Observable<DemandOfferEvent>;

  /**
   * Start looking at the Agreement related events
   */
  observeAgreementEvents(): Observable<AgreementEvent>;

  /**
   * Sends a counter-proposal to the given proposal. Returns the newly created counter-proposal.
   */
  counterProposal(receivedProposal: OfferProposal, specification: DemandSpecification): Promise<OfferProposal>;

  /**
   * Sends a "reject" response for the proposal that was received from the Provider as part of the negotiation process
   *
   * On the protocol level this means that no further counter-proposals will be generated by the Requestor
   *
   * @param receivedProposal The proposal from the provider
   * @param reason User readable reason that should be presented to the Provider
   */
  rejectProposal(receivedProposal: OfferProposal, reason: string): Promise<void>;

  /**
   * Fetches payment related decorations, based on the given allocation ID.
   *
   * @param allocationId The ID of the allocation that will be used to pay for computations related to the demand
   *
   */
  getPaymentRelatedDemandDecorations(allocationId: string): Promise<DemandBodyPrototype>;

  getAgreement(id: string): Promise<Agreement>;

  /**
   * Request creating an agreement from the provided proposal
   *
   * Use this method if you want to decide what should happen with the agreement after it is created
   *
   * @return An agreement that's in a "Proposal" state (not yet usable for activity creation)
   */
  createAgreement(proposal: OfferProposal): Promise<Agreement>;

  /**
   * Request creating an agreement from the provided proposal, send it to the Provider and wait for approval
   *
   * Use this method when you want to quickly finalize the deal with the Provider, but be ready for a rejection
   *
   * @return An agreement that's already in an "Approved" state and can be used to create activities on the Provider
   */
  proposeAgreement(proposal: OfferProposal): Promise<Agreement>;

  // TODO: Detach return type from ya-ts-client!
  getAgreementState(id: string): Promise<MarketApi.AgreementDTO["state"]>;

  confirmAgreement(agreement: Agreement, appSessionId: string): Promise<Agreement>;

  terminateAgreement(agreement: Agreement, reason?: string): Promise<Agreement>;
}
