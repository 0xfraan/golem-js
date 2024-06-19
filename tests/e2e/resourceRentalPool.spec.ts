import { Subscription } from "rxjs";
import { Allocation, DraftOfferProposalPool, GolemAbortError, GolemNetwork } from "../../src";

describe("ResourceRentalPool", () => {
  const glm = new GolemNetwork();
  let proposalPool: DraftOfferProposalPool;
  let allocation: Allocation;
  let draftProposalSub: Subscription;

  beforeAll(async () => {
    await glm.connect();
    allocation = await glm.payment.createAllocation({
      budget: 5,
      // 30 minutes
      expirationSec: 60 * 30,
    });
  });

  afterAll(async () => {
    await glm.payment.releaseAllocation(allocation);
    await glm.disconnect();
  });

  beforeEach(async () => {
    proposalPool = new DraftOfferProposalPool();
    const demandSpecification = await glm.market.buildDemandDetails(
      {
        workload: {
          imageTag: "golem/alpine:latest",
        },
      },
      allocation,
    );

    const draftProposal$ = glm.market.collectDraftOfferProposals({
      demandSpecification,
      pricing: {
        model: "linear",
        maxStartPrice: 0.5,
        maxCpuPerHourPrice: 1.0,
        maxEnvPerHourPrice: 0.5,
      },
    });

    draftProposalSub = proposalPool.readFrom(draftProposal$);
  });

  afterEach(async () => {
    draftProposalSub.unsubscribe();
    await proposalPool.clear();
  });

  it("should run a simple script on the activity from the pool", async () => {
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 1 });
    pool.events.on("error", (error) => {
      throw error;
    });
    const resourceRental = await pool.acquire();
    expect(pool.getSize()).toEqual(1);
    expect(pool.getAvailableSize()).toEqual(0);
    expect(pool.getBorrowedSize()).toEqual(1);
    const result = await resourceRental.getExeUnit().then((exe) => exe.run("echo Hello World"));
    expect(result.stdout?.toString().trim()).toEqual("Hello World");
    await pool.destroy(resourceRental);
    await pool.drainAndClear();
  });

  it("should prepare two activity ready to use", async () => {
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 2 });
    pool.events.on("error", (error) => {
      throw error;
    });
    await pool.ready();
    expect(pool.getSize()).toEqual(2);
    expect(pool.getAvailableSize()).toEqual(2);
    expect(pool.getBorrowedSize()).toEqual(0);
    const rental1 = await pool.acquire();
    const activity1 = await rental1.getExeUnit();
    expect(pool.getAvailableSize()).toEqual(1);
    expect(pool.getBorrowedSize()).toEqual(1);
    const rental2 = await pool.acquire();
    const activity2 = await rental2.getExeUnit();
    expect(pool.getAvailableSize()).toEqual(0);
    expect(pool.getBorrowedSize()).toEqual(2);
    expect(activity1).toBeDefined();
    expect(activity2).toBeDefined();
    expect(activity1.provider.id).not.toEqual(activity2.provider.id);
    await pool.release(rental1);
    expect(pool.getAvailableSize()).toEqual(1);
    expect(pool.getBorrowedSize()).toEqual(1);
    await pool.release(rental2);
    expect(pool.getAvailableSize()).toEqual(2);
    expect(pool.getBorrowedSize()).toEqual(0);
    await pool.drainAndClear();
  });

  it("should release the activity and reuse it again", async () => {
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 1 });
    pool.events.on("error", (error) => {
      throw error;
    });
    const rental = await pool.acquire();
    const activity = await rental.getExeUnit();
    const result1 = await activity.run("echo result-1");
    expect(result1.stdout?.toString().trim()).toEqual("result-1");
    await pool.release(rental);
    const sameRental = await pool.acquire();
    const activityAfterRelease = await sameRental.getExeUnit();
    const result2 = await activityAfterRelease.run("echo result-2");
    expect(result2.stdout?.toString().trim()).toEqual("result-2");
    await pool.destroy(sameRental);
    expect(activity.activity.id).toEqual(activityAfterRelease.activity.id);
    await pool.drainAndClear();
  });

  it("should terminate all agreements after drain and clear the poll", async () => {
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 2 });
    pool.events.on("error", (error) => {
      throw error;
    });
    const agreementTerminatedIds: string[] = [];
    pool.events.on("destroyed", (agreement) => agreementTerminatedIds.push(agreement.id));

    const rental1 = await pool.acquire();
    const rental2 = await pool.acquire();

    const activity1 = await rental1.getExeUnit();
    const activity2 = await rental2.getExeUnit();

    await activity1.run("echo result-1");
    await activity2.run("echo result-2");

    await pool.release(rental1);
    await pool.release(rental2);
    await pool.drainAndClear();
    expect(agreementTerminatedIds.sort()).toEqual(
      [activity1.activity.agreement.id, activity2.activity.agreement.id].sort(),
    );
  });

  it("should establish a connection between two activities from pool via vpn", async () => {
    const network = await glm.network.createNetwork();
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 2, network });
    pool.events.on("error", (error) => {
      throw error;
    });
    const resourceRental1 = await pool.acquire();
    const resourceRental2 = await pool.acquire();
    const exe1 = await resourceRental1.getExeUnit();
    const exe2 = await resourceRental2.getExeUnit();
    const result1 = await exe1.run(`ping ${exe2.getIp()} -c 4`);
    const result2 = await exe2.run(`ping ${exe1.getIp()} -c 4`);
    expect(result1.stdout?.toString().trim()).toMatch("4 packets transmitted, 4 packets received, 0% packet loss");
    expect(result2.stdout?.toString().trim()).toMatch("4 packets transmitted, 4 packets received, 0% packet loss");
    expect(Object.keys(network.getNetworkInfo().nodes)).toEqual(["192.168.0.1", "192.168.0.2", "192.168.0.3"]);
    await pool.destroy(resourceRental1);
    await pool.destroy(resourceRental2);
    await pool.drainAndClear();
    await glm.network.removeNetwork(network);
  });

  it("should not rent more resources than maximum size", async () => {
    const maxPoolSize = 3;
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, {
      replicas: { min: 1, max: maxPoolSize },
    });
    const poolSizesDuringWork: number[] = [];
    pool.events.on("acquired", () => poolSizesDuringWork.push(pool.getSize()));
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    await Promise.allSettled(
      data.map((item) =>
        pool.withRental((rental) =>
          rental.getExeUnit().then((exe) => exe.run(`echo ${item} from provider ${exe.provider.name}`)),
        ),
      ),
    );
    expect(Math.max(...poolSizesDuringWork)).toEqual(maxPoolSize);
  });

  it("should abort acquiring resource rental by signal", async () => {
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 1 });
    const abortController = new AbortController();
    abortController.abort();
    await expect(pool.acquire(abortController.signal)).rejects.toThrow("The signing of the agreement has been aborted");
  });

  it("should abort acquiring resource rental by timeout", async () => {
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 1 });
    await expect(pool.acquire(1_000)).rejects.toThrow("Could not sign any agreement in time");
  });

  it("should finalize the resource rental during execution", async () => {
    expect.assertions(1);
    const pool = glm.rental.createResourceRentalPool(proposalPool, allocation, { replicas: 1 });
    const resourceRental = await pool.acquire();
    const exe = await resourceRental.getExeUnit();
    return new Promise(async (res) => {
      resourceRental.events.on("finalized", async () => res(true));
      setTimeout(() => resourceRental.finalize(), 8_000);
      await expect(exe.run("sleep 10 && echo Hello World")).rejects.toThrow(
        new GolemAbortError("Execution of script has been aborted"),
      );
    });
  });
});
