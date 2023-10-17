import { MarketService } from "../market/";
import { AgreementPoolService } from "../agreement/";
import { TaskService } from "../task/";
import { TaskExecutor } from "./executor";
import { sleep } from "../utils";

jest.mock("../market/service");
jest.mock("../agreement/service");
jest.mock("../network/service");
jest.mock("../task/service");
jest.mock("../storage/gftp");
jest.mock("../utils/yagna/yagna");

const serviceRunSpy = jest.fn().mockImplementation(() => Promise.resolve());
jest.spyOn(MarketService.prototype, "run").mockImplementation(serviceRunSpy);
jest.spyOn(AgreementPoolService.prototype, "run").mockImplementation(serviceRunSpy);
jest.spyOn(TaskService.prototype, "run").mockImplementation(serviceRunSpy);

jest.mock("../payment/service", () => {
  return {
    PaymentService: jest.fn().mockImplementation(() => {
      return {
        config: { payment: { network: "test" } },
        createAllocation: jest.fn(),
        run: serviceRunSpy,
      };
    }),
  };
});

describe("Task Executor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("init()", () => {
    it("should run all set services", async () => {
      const executor = await TaskExecutor.create({ package: "test" });
      expect(serviceRunSpy).toHaveBeenCalledTimes(4);
      expect(executor).toBeDefined();
    });
    it("should handle a critical error if startup timeout is reached", async () => {
      const executor = await TaskExecutor.create({ package: "test", startupTimeout: 0 });
      jest
        .spyOn(MarketService.prototype, "getProposalsCount")
        .mockImplementation(() => ({ confirmed: 0, initial: 0, rejected: 0 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleErrorSpy = jest.spyOn(executor as any, "handleCriticalError").mockImplementation((error) => {
        expect((error as Error).message).toEqual(
          "Could not start any work on Golem. Processed 0 initial proposals from yagna, filters accepted 0. Check your demand if it's not too restrictive or restart yagna.",
        );
      });
      await sleep(10, true);
      expect(handleErrorSpy).toHaveBeenCalled();
    });
  });
});
