async function main() {
  const script = new Script();
  script.addCommand("run", { cmd: "/bin/sh", args: ["-c", 'echo "Hello World"'] });
  const task = new Task(script);

  const deploy_package = new Package({ image_hash: "todo" });
  const golem = new Golem({
    deploy_package,
    tasks: [task],
    other_options,
  });
  const results = await golem.run();

  results.on("data", (result) => {
    console.log(`Task: ${result.task_id}, Provider: ${result.provider_id}, Stdout: ${result.stdout}`);
  });
}
