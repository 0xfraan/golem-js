import { PricingInfo, ProposalProperties } from "../proposal";
import { GolemInternalError } from "../../shared/error/golem-error";
import type { MarketApi } from "ya-ts-client";

type ScannedOfferDTO = MarketApi.OfferDTO;

export class ScannedOffer {
  constructor(private readonly model: ScannedOfferDTO) {}

  get properties(): ProposalProperties {
    return this.model.properties as ProposalProperties;
  }

  get constraints(): string {
    return this.model.constraints;
  }

  get pricing(): PricingInfo {
    const usageVector = this.properties["golem.com.usage.vector"];
    const priceVector = this.properties["golem.com.pricing.model.linear.coeffs"];

    if (!usageVector) {
      throw new GolemInternalError(
        "The proposal does not contain 'golem.com.usage.vector' property. We can't estimate the costs.",
      );
    }

    if (!priceVector) {
      throw new GolemInternalError(
        "The proposal does not contain 'golem.com.pricing.model.linear.coeffs' property. We can't estimate costs.",
      );
    }

    const envIdx = usageVector.findIndex((ele) => ele === "golem.usage.duration_sec");
    const cpuIdx = usageVector.findIndex((ele) => ele === "golem.usage.cpu_sec");

    const envSec = priceVector[envIdx] ?? 0.0;
    const cpuSec = priceVector[cpuIdx] ?? 0.0;
    const start = priceVector[priceVector.length - 1];

    return {
      cpuSec,
      envSec,
      start,
    };
  }

  get provider() {
    return {
      id: this.model.providerId,
      name: this.properties["golem.node.id.name"] || "<unknown>",
    };
  }

  get transferProtocol() {
    return this.properties["golem.activity.caps.transfer.protocol"];
  }

  get cpuBrand() {
    return this.properties["golem.inf.cpu.brand"];
  }

  get cpuCapabilities() {
    return this.properties["golem.inf.cpu.capabilities"];
  }

  get cpuCores() {
    return this.properties["golem.inf.cpu.cores"];
  }

  get cpuThreads() {
    return this.properties["golem.inf.cpu.threads"];
  }

  /** @deprecated Use {@link memoryGib} instead */
  get memory() {
    return this.memoryGib;
  }

  get memoryGib() {
    return this.properties["golem.inf.mem.gib"];
  }

  /** @deprecated Use {@link storageGib} instead */
  get storage() {
    return this.storageGib;
  }

  get storageGib() {
    return this.properties["golem.inf.storage.gib"];
  }

  get publicNet() {
    return this.properties["golem.node.net.is-public"];
  }

  get runtimeCapabilities() {
    return this.properties["golem.runtime.capabilities"];
  }

  get runtimeName() {
    return this.properties["golem.runtime.name"];
  }

  /**
   * Get the ID of the offer published by the Provider
   *
   * Note:
   * - this ID will change after the provider refreshes the offer (usually after 1h)
   * - this ID will remain unchanged for the same published offer between different scans
   */
  get offerId() {
    return this.model.offerId;
  }
}
