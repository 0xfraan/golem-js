import { LoggerMock, YagnaMock } from "../mock";
import { NetworkService } from "../../src/network";
const logger = new LoggerMock();
const yagnaApi = new YagnaMock().getApi();
describe("Network Service", () => {
  beforeEach(() => {
    logger.clear();
  });

  describe("Creating", () => {
    it("should start service and create network", async () => {
      const networkService = new NetworkService(yagnaApi, { logger });
      await networkService.run("test_owner_id");
      await logger.expectToInclude(
        "Network created",
        {
          id: expect.anything(),
          ip: "192.168.0.0",
          mask: "255.255.255.0",
        },
        10,
      );
      await logger.expectToInclude("Network Service has started");
      await networkService.end();
    });
  });

  describe("Nodes", () => {
    it("should add node to network", async () => {
      const networkService = new NetworkService(yagnaApi, { logger });
      await networkService.run("test_owner_id");
      await networkService.addNode("provider_2");
      await logger.expectToInclude(
        "Node has added to the network.",
        {
          id: "provider_2",
          ip: "192.168.0.2",
        },
        10,
      );
      await networkService.end();
    });

    it("should not add node if the service is not started", async () => {
      const networkService = new NetworkService(yagnaApi, { logger });
      const result = networkService.addNode("provider_2");
      await expect(result).rejects.toThrow("The service is not started and the network does not exist");
    });
  });

  describe("Removing", () => {
    it("should end service and remove network", async () => {
      const networkService = new NetworkService(yagnaApi, { logger });
      await networkService.run("test_owner_id");
      await networkService.end();
      await logger.expectToInclude(
        "Network has removed:",
        {
          id: expect.anything(),
          ip: expect.anything(),
        },
        60,
      );
      await logger.expectToInclude("Network Service has been stopped");
      await networkService.end();
    });
  });
});
