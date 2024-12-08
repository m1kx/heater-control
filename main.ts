import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import "jsr:@std/dotenv/load";
import { CronHandler } from "./src/util/cron.ts";
import { Database, StoreCron, StoreDevice } from "./src/util/database.ts";
import { controller, Device } from "./src/util/heatingsystem.ts";

const router = new Router();

await controller.connect();
console.log("connected");

Database.create(Deno.env.get("DATABASE_PATH") || "database.db");
console.log("Created database");

const deviceList = await controller.getDeviceList();
console.log("Device List:", deviceList);

CronHandler.initializeCrons();

router.use((ctx, next) => {
  console.log("Request to api...");
  const apiToken = Deno.env.get("APIKEY");
  if (!apiToken) {
    ctx.response.body = {
      success: false,
      error: "No apikey set on server",
    };
    return;
  }
  if (ctx.request.headers.get("Authorization") !== `Bearer ${apiToken}`) {
    ctx.response.body = {
      success: false,
      error: "Missing/wrong authentication",
    };
    return;
  }
  return next();
});

interface ConnectRequestBody {
  name: string;
}
router.post("/connect", async (ctx) => {
  try {
    const request: ConnectRequestBody = await ctx.request.body.json();
    if (!request.name) {
      throw new Error("Missing parameter in request body");
    }
    const { rfAddress } = await controller.newDevice();
    Database.insert({
      name: request.name,
      rfAddress,
    });
    ctx.response.body = {
      success: true,
      rfAddress,
    };
  } catch (error) {
    ctx.response.body = {
      success: false,
      error: (error as Error).message,
    };
    return;
  }
});

interface DisonnectRequestBody {
  rfAddress: string;
}
router.post("/disconnect", async (ctx) => {
  try {
    const request: DisonnectRequestBody = await ctx.request.body.json();
    if (!request.rfAddress) {
      throw new Error("Missing parameter in request body");
    }
    await controller.deleteDevices([request.rfAddress], true);
    Database.remove(request.rfAddress);
    ctx.response.body = {
      success: true,
    };
  } catch (error) {
    ctx.response.body = {
      success: false,
      error: (error as Error).message,
    };
    return;
  }
});

interface SetTemperatureRequestBody {
  targetTemperature: number;
  rfAddress: string;
}
router.post("/settemperature", async (ctx) => {
  try {
    const request: SetTemperatureRequestBody = await ctx.request.body.json();
    if (!request.targetTemperature || !request.rfAddress) {
      throw new Error("Missing parameter in request body");
    }
    const deviceList = await controller.getDeviceList();
    if (!deviceList.some((device) => device.rfAddress === request.rfAddress)) {
      throw new Error("Device not existing");
    }
    await controller.setTemperature(
      request.rfAddress,
      request.targetTemperature,
    );
    ctx.response.body = {
      success: true,
    };
  } catch (error) {
    ctx.response.body = {
      success: false,
      error: (error as Error).message,
    };
    return;
  }
});

interface CombinedDevice extends StoreDevice, Device {}
router.get("/devices", async (ctx) => {
  const devices: CombinedDevice[] = [];
  const storedDevices = Database.getAllDevices();
  const deviceList = await controller.getDeviceList();
  for (const stored of storedDevices) {
    const matchingInList = deviceList.find((device) =>
      device.rfAddress === stored.rfAddress
    );
    if (!matchingInList) continue;
    devices.push({
      ...matchingInList,
      ...stored,
    });
  }
  ctx.response.body = {
    success: true,
    devices: devices,
  };
});

router.get("/crons", (ctx) => {
  const allCrons = Database.getCrons();
  ctx.response.body = {
    success: true,
    crons: allCrons,
  };
});

interface CronRequestBody extends StoreCron {
}
router.post("/newcron", async (ctx) => {
  try {
    const request: CronRequestBody = await ctx.request.body.json();
    if (
      !request.cron || !request.name || !request.rfAdresses ||
      !request.temperature
    ) {
      throw new Error("Missing parameter in request body");
    }
    try {
      CronHandler.newCron(request);
    } catch (error) {
      throw error;
    }
  } catch (error) {
    ctx.response.body = {
      success: false,
      error: (error as Error).message,
    };
    return;
  }
});

interface RemoveCronRequestBody {
  name: string;
}
router.post("/removecron", async (ctx) => {
  try {
    const request: RemoveCronRequestBody = await ctx.request.body.json();
    if (!request.name) {
      throw new Error("Missing parameter in request body");
    }
    CronHandler.removeCron(request.name);
    ctx.response.body = {
      success: true,
    };
  } catch (error) {
    ctx.response.body = {
      success: false,
      error: (error as Error).message,
    };
    return;
  }
});

router.get("/alloff", async (ctx) => {
  const deviceList = await controller.getDeviceList();
  for (const device of deviceList) {
    await controller.setTemperature(device.rfAddress, 17)
  }
  ctx.response.body = {
    success: true,
  };
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

app.listen({ port: 999 });
