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
  try {
    await Deno.cron(cron.name, cron.cron, {
      signal: abortController.signal,
    }, async () => {
      console.log(`Running cron ${cron.cron}`);
      cron = Database.getCronByName(cron.name)!;
      if (!cron.enabled) {
        console.log(`Cron ${cron.name} disabled`);
        return;
      }
      if (cron.oneTime) {
        removeCron(cron.name);
      }
      for (const address of cron.rfAdresses) {
        try {
          controller.setTemperature(address, cron.temperature);
        } catch (_error) {
          await controller.connect();
          controller.setTemperature(address, cron.temperature);
        }
      }
    });
  } catch (error) {
    console.error(`Error in cron ${cron.name}: ${error}`);
  }
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
