import { AbstractAggregator } from "../../src/stats/abstract_aggregator";
import { Activities } from "../../src/stats/activities";
import { Agreements, AgreementStatusEnum } from "../../src/stats/agreements";
import { Allocations } from "../../src/stats/allocations";
import { Invoices } from "../../src/stats/invoices";
import { Payments } from "../../src/stats/payments";
import { Proposals } from "../../src/stats/proposals";
import { Providers } from "../../src/stats/providers";
import { Tasks, TaskStatusEnum } from "../../src/stats/tasks";
import { Collection } from "collect.js";

const testProvider = {
  id: "testId",
  name: "test name",
  walletAddress: "testWalletAddress",
};

const testProvider2 = {
  id: "testId2",
  name: "test name2",
  walletAddress: "testWalletAddress2",
};

const testProvider3 = {
  id: "testId3",
  name: "test name3",
  walletAddress: "testWalletAddress3",
};

describe("Stats Module", () => {
  describe("Abstract Aggregator", () => {
    it("should add() add items", async () => {
      const tests = new Dummy();
      tests.add({ id: "id", parentId: "parentId" });
      expect(tests.getAll().count()).toEqual(1);
    });
    it("should getById() return ItemInfo", async () => {
      const tests = new Dummy();
      tests.add({ id: "id", parentId: "parentId" });
      expect(tests.getById("id")).toEqual({ id: "id", parentId: "parentId" });
    });
    it("should getAll() return Collection of ItemInfo", async () => {
      const tests = new Dummy();
      tests.add({ id: "id", parentId: "parentId" });
      tests.add({ id: "id2", parentId: "parentId" });
      expect(tests.getAll()).toBeInstanceOf(Collection);
      expect(tests.getAll().count()).toEqual(2);
    });
    it("should getByField() return filtered Collection of ItemInfo", async () => {
      const tests = new Dummy();
      tests.add({ id: "id", parentId: "parentId" });
      tests.add({ id: "id2", parentId: "parentId2" });
      tests.add({ id: "id3", parentId: "parentId3" });
      expect(tests.getByParentId("parentId2")).toBeInstanceOf(Collection);
      expect(tests.getByParentId("parentId2").count()).toEqual(1);
    });

    it("should getByField() return empty Collection if there is no existing key", async () => {
      const tests = new Dummy();
      tests.add({ id: "id", parentId: "parentId" });
      tests.add({ id: "id2", parentId: "parentId2" });
      tests.add({ id: "id3", parentId: "parentId3" });
      expect(tests.getByNotExistingKey()).toBeInstanceOf(Collection);
      expect(tests.getByNotExistingKey().count()).toEqual(0);
    });
  });
  describe("Activities", () => {
    it("should beforeAdd() converts payload to ActivityInfo", async () => {
      const tests = new Activities();
      tests.add({ id: "id", taskId: "taskId", agreementId: "agreementId" });
      expect(tests.getAll()).toEqual(new Collection([{ id: "id", taskId: "taskId", agreementId: "agreementId" }]));
    });
    it("should getByAgreementId() return Collection of ActivityInfo", async () => {
      const tests = new Activities();
      tests.add({ id: "id", taskId: "taskId", agreementId: "agreementId" });
      tests.add({ id: "id2", taskId: "taskId2", agreementId: "agreementId2" });
      tests.add({ id: "id3", taskId: "taskId3", agreementId: "agreementId3" });
      expect(tests.getByAgreementId("agreementId").count()).toEqual(1);
    });
    it("should getByTaskId() return Collection of ActivityInfo", async () => {
      const tests = new Activities();
      tests.add({ id: "id", taskId: "taskId", agreementId: "agreementId" });
      tests.add({ id: "id2", taskId: "taskId2", agreementId: "agreementId2" });
      tests.add({ id: "id3", taskId: "taskId3", agreementId: "agreementId3" });
      expect(tests.getByTaskId("taskId").count()).toEqual(1);
    });
  });
  describe("Agreements", () => {
    it("should beforeAdd() converts payload to AgreementInfo", async () => {
      const tests = new Agreements();
      tests.add({ id: "id", provider: testProvider, proposalId: "proposalId" });
      expect(tests.getAll()).toEqual(
        new Collection([
          { id: "id", provider: testProvider, proposalId: "proposalId", status: AgreementStatusEnum.Pending },
        ]),
      );
    });
    it("should confirm() flag AgreementInfo.status as confirmed ", async () => {
      const tests = new Agreements();
      tests.add({ id: "id", provider: testProvider, proposalId: "proposalId" });
      tests.confirm("id");
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            id: "id",
            provider: testProvider,
            proposalId: "proposalId",
            status: AgreementStatusEnum.Confirmed,
          },
        ]),
      );
    });
    it("should reject() flag AgreementInfo.status as rejected ", async () => {
      const tests = new Agreements();
      tests.add({ id: "id", provider: testProvider, proposalId: "proposalId" });
      tests.reject("id");
      expect(tests.getAll()).toEqual(
        new Collection([
          { id: "id", provider: testProvider, proposalId: "proposalId", status: AgreementStatusEnum.Rejected },
        ]),
      );
    });
    it("should getByProviderId() return filtered Collection of AgreementInfo", async () => {
      const tests = new Agreements();
      tests.add({ id: "id", provider: testProvider, proposalId: "proposalId" });
      tests.add({ id: "id2", provider: testProvider2, proposalId: "proposalId" });
      tests.add({ id: "id3", provider: testProvider, proposalId: "proposalId" });
      expect(tests.getByProviderId(testProvider.id).count()).toEqual(2);
    });
    it("should getByStatus() return filtered Collection of AgreementInfo", async () => {
      const tests = new Agreements();
      tests.add({ id: "id", provider: testProvider, proposalId: "proposalId" });
      tests.reject("id");
      tests.add({ id: "id2", provider: testProvider2, proposalId: "proposalId" });
      tests.confirm("id2");
      tests.add({ id: "id3", provider: testProvider, proposalId: "proposalId" });
      expect(tests.getByStatus(AgreementStatusEnum.Rejected).count()).toEqual(1);
      expect(tests.getByStatus(AgreementStatusEnum.Confirmed).count()).toEqual(1);
      expect(tests.getByStatus(AgreementStatusEnum.Pending).count()).toEqual(1);
    });
  });
  describe("Allocations", () => {
    it("should beforeAdd() converts payload to AllocationInfo", async () => {
      const tests = new Allocations();
      tests.add({ id: "id", amount: 100, platform: "platform" });
      expect(tests.getAll()).toEqual(new Collection([{ id: "id", amount: 100, platform: "platform" }]));
    });
  });
  describe("Invoices", () => {
    it("should beforeAdd() converts payload to InvoiceInfo", async () => {
      const tests = new Invoices();
      tests.add({
        id: "id",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId",
      });
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            id: "id",
            amount: "100",
            provider: testProvider,
            agreementId: "agreementId",
          },
        ]),
      );
    });
    it("should getByProviderId() return filtered Collection of InvoiceInfo", async () => {
      const tests = new Invoices();
      tests.add({
        id: "id",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId",
      });
      tests.add({
        id: "id2",
        amount: "100",
        provider: testProvider2,
        agreementId: "agreementId2",
      });
      tests.add({
        id: "id3",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId3",
      });
      expect(tests.getByProviderId(testProvider.id).count()).toEqual(2);
    });
    it("should getByAgreementId() return filtered Collection of InvoiceInfo", async () => {
      const tests = new Invoices();
      tests.add({
        id: "id",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId",
      });
      tests.add({
        id: "id2",
        amount: "100",
        provider: testProvider2,
        agreementId: "agreementId2",
      });
      tests.add({
        id: "id3",
        amount: "100",
        provider: testProvider3,
        agreementId: "agreementId",
      });
      expect(tests.getByAgreementId("agreementId").count()).toEqual(2);
    });
  });
  describe("Payments", () => {
    it("should beforeAdd() converts payload to PaymentInfo", async () => {
      const tests = new Payments();
      tests.add({
        id: "id",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId",
      });
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            id: "id",
            amount: "100",
            provider: testProvider,
            agreementId: "agreementId",
          },
        ]),
      );
    });
    it("should getByProviderId() return filtered Collection of PaymentInfo", async () => {
      const tests = new Payments();
      tests.add({
        id: "id",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId",
      });
      tests.add({
        id: "id2",
        amount: "100",
        provider: testProvider2,
        agreementId: "agreementId2",
      });
      tests.add({
        id: "id3",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId3",
      });
      expect(tests.getByProviderId(testProvider.id).count()).toEqual(2);
    });
    it("should getByAgreementId() return filtered Collection of PaymentInfo", async () => {
      const tests = new Payments();
      tests.add({
        id: "id",
        amount: "100",
        provider: testProvider,
        agreementId: "agreementId",
      });
      tests.add({
        id: "id2",
        amount: "100",
        provider: testProvider2,
        agreementId: "agreementId2",
      });
      tests.add({
        id: "id3",
        amount: "100",
        provider: testProvider3,
        agreementId: "agreementId",
      });
      expect(tests.getByAgreementId("agreementId").count()).toEqual(2);
    });
  });
  describe("Proposals", () => {
    it("should beforeAdd() converts payload to ProposalInfo", async () => {
      const tests = new Proposals();
      tests.add({ id: "id", providerId: testProvider.id });
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            id: "id",
            providerId: testProvider.id,
          },
        ]),
      );
    });

    it("should getByProviderId() return filtered Collection of ProposalInfo", async () => {
      const tests = new Proposals();
      tests.add({ id: "id", providerId: testProvider.id });
      tests.add({ id: "id2", providerId: testProvider2.id });
      tests.add({ id: "id3", providerId: testProvider.id });
      expect(tests.getByProviderId(testProvider.id)).toBeInstanceOf(Collection);
      expect(tests.getByProviderId(testProvider.id).count()).toEqual(2);
    });
  });
  describe("Providers", () => {
    it("should beforeAdd() converts payload to ProviderInfo", async () => {
      const tests = new Providers();
      tests.add(testProvider);
      expect(tests.getAll()).toEqual(new Collection([testProvider]));
    });

    it("should beforeAdd() should setup providerName as unknown by default", async () => {
      const tests = new Providers();
      tests.add(testProvider);
      expect(tests.getAll()).toEqual(new Collection([testProvider]));
    });

    it("should beforeAdd() should update providerName if provided", async () => {
      const tests = new Providers();
      tests.add(testProvider);
      expect(tests.getAll()).toEqual(new Collection([testProvider]));
      tests.add(testProvider);
      expect(tests.getAll()).toEqual(new Collection([testProvider]));
    });
    it("should beforeAdd() should use previous providerName if is not provided", async () => {
      const tests = new Providers();
      tests.add(testProvider);
      expect(tests.getAll()).toEqual(new Collection([testProvider]));
      tests.add(testProvider);
      expect(tests.getAll()).toEqual(new Collection([testProvider]));
    });
  });
  describe("Tasks", () => {
    it("should beforeAdd() converts payload to TaskInfo", async () => {
      const tests = new Tasks();
      tests.add({ agreementId: "test_id", id: "id", startTime: 100 });
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            id: "id",
            agreementId: "test_id",
            startTime: 100,
            stopTime: 0,
            retriesCount: 0,
            status: TaskStatusEnum.Pending,
          },
        ]),
      );
    });
    it("should retry() should setup TaskInfo.retriesCount", async () => {
      const tests = new Tasks();
      tests.add({ agreementId: "test_id", id: "id", startTime: 100 });
      tests.retry("id", 1);
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            agreementId: "test_id",
            id: "id",
            startTime: 100,
            stopTime: 0,
            retriesCount: 1,
            status: TaskStatusEnum.Pending,
          },
        ]),
      );
    });
    it("should reject() should setup TaskInfo.status as Rejected, stopTime and reason", async () => {
      const tests = new Tasks();
      tests.add({ agreementId: "test_id", id: "id", startTime: 100 });
      tests.reject("id", 200, "reason");
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            id: "id",
            agreementId: "test_id",
            startTime: 100,
            stopTime: 200,
            retriesCount: 0,
            status: TaskStatusEnum.Rejected,
            reason: "reason",
          },
        ]),
      );
    });
    it("should finish() should setup TaskInfo.status as Finished, and stopTime", async () => {
      const tests = new Tasks();
      tests.add({ agreementId: "test_id", id: "id", startTime: 100 });
      tests.finish("id", 200);
      expect(tests.getAll()).toEqual(
        new Collection([
          {
            id: "id",
            agreementId: "test_id",
            startTime: 100,
            stopTime: 200,
            retriesCount: 0,
            status: TaskStatusEnum.Finished,
          },
        ]),
      );
    });
  });
});

export interface DummyInfo {
  id: string;
  parentId: string;
}

interface Payload {
  id: string;
  parentId: string;
}

export class Dummy extends AbstractAggregator<Payload, DummyInfo> {
  beforeAdd(payload): DummyInfo {
    return payload;
  }
  getByParentId(parentId: string) {
    return this.getByField("parentId", parentId);
  }
  getByNotExistingKey() {
    return this.getByField("key_doesnt_exists", 0);
  }
}
