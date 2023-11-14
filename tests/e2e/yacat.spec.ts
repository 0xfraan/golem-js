import { TaskExecutor } from "../../src";
import { LoggerMock } from "../mock";
const logger = new LoggerMock(false);

const range = (start: number, end: number, step = 1): number[] => {
  const list: number[] = [];
  for (let index = start; index < end; index += step) list.push(index);
  return list;
};

describe("Password cracking", function () {
  let executor: TaskExecutor;
  it(
    "should crack password",
    async () => {
      const mask = "?a?a";
      const hash = "$P$5ZDzPE45CigTC6EY4cXbyJSLj/pGee0";
      executor = await TaskExecutor.create({
        /**
         * Using the latest yacat image tag `golem/examples-hashcat:latest`
         * causes problems with providers in Goth:
         * Error: `Device #1: Not enough allocatable device memory for this attack`,
         * So for now we leave the old version with image hash for Goth test
         */
        package: "055911c811e56da4d75ffc928361a78ed13077933ffa8320fb1ec2db",
        budget: 10,
        logger,
      });
      const keyspace = await executor.run<number>(async (ctx) => {
        const result = await ctx.run(`hashcat --keyspace -a 3 ${mask} -m 400`);
        return parseInt(result.stdout?.toString() || "");
      });
      expect(keyspace).toEqual(95);
      if (!keyspace) return;
      const step = Math.floor(keyspace / 3);
      const ranges = range(0, keyspace, step);
      const futureResults = ranges.map((skip) =>
        executor.run(async (ctx) => {
          const results = await ctx
            .beginBatch()
            .run(
              `hashcat -a 3 -m 400 '${hash}' '${mask}' --skip=${skip} --limit=${skip! + step} -o pass.potfile -D 1,2`,
            )
            .run("cat pass.potfile")
            .end();
          if (!results?.[1]?.stdout) return false;
          return results?.[1]?.stdout.toString().split(":")?.[1]?.trim();
        }),
      );
      const results = await Promise.all(futureResults);
      let password = "";
      for (const result of results) {
        if (result) {
          password = result;
          break;
        }
      }
      expect(password).toEqual("yo");
      await executor.end();
    },
    1000 * 60 * 5,
  );
});
