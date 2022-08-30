import { createGolem } from "../../dist";

(async function main() {
  const golem = await createGolem("9a3b5d67b0b27746283cb5f287c13eab1beaa12d92a9f536b747c7ae");
  await golem.run(async (ctx) => {
    const results = await ctx
      .beginBatch()
      .run('echo "Hello Golem"')
      .run('echo "Hello World"')
      .run("error_command")
      .endStream();
    results.on("data", ({ stdout }) => console.log(stdout));
    results.on("error", (error) => console.error(error.toString()));
    results.on("close", () => console.log("Finish"));
  });
  await golem.end();
})();
