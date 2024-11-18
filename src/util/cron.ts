import { Database, StoreCron } from "./database.ts";
import { controller } from "./heatingsystem.ts";

const cronController = new Map<string, AbortController>();

const newCron = (cron: StoreCron) => {
  Database.addCron(cron);
  initializeCron(cron);
};

const initializeCrons = () => {
  const crons = Database.getCrons();
  for (const cron of crons) {
    initializeCron(cron);
  }
};

const initializeCron = async (cron: StoreCron) => {
  console.log(`Initializing cron ${cron.cron} ${cron.name}`);
  const abortController = new AbortController();
  cronController.set(cron.name, abortController);
  await Deno.cron(cron.name, cron.cron, {
    signal: abortController.signal,
  }, async () => {
    console.log(`Running cron ${cron.cron}`);
    for (const address of cron.rfAdresses) {
      try {
        controller.setTemperature(address, cron.temperature);
      } catch (_error) {
        await controller.connect();
        controller.setTemperature(address, cron.temperature);
      }
    }
  });
};

const removeCron = (name: string) => {
  Database.removeCron(name);
  console.log(`Abort cron ${name}`);
  cronController.get(name)?.abort();
};

export const CronHandler = {
  newCron,
  initializeCrons,
  removeCron,
};