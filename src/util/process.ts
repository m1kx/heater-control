const restartSelf = () => {
  const denoPath = Deno.execPath();
  let args: string[] = [];
  if (Deno.env.get("DEV") === "true") {
    args = ["task", "dev"];
  }
  const command = new Deno.Command(denoPath, { args });
  command.spawn();
  Deno.exit();
};

export const Process = {
  restartSelf,
};
