import { DB } from "https://deno.land/x/sqlite/mod.ts";

let db: DB | null;

export interface StoreDevice {
  rfAddress: string;
  name: string;
}

export interface StoreCron {
  rfAdresses: string[];
  cron: string;
  temperature: number;
  name: string;
  oneTime: boolean;
}

const create = (name: string) => {
  db = new DB(name);
  db.execute(`
    CREATE TABLE IF NOT EXISTS devices (
      rfAddress TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);
  db.execute(`
    CREATE TABLE IF NOT EXISTS crons (
      name TEXT PRIMARY KEY,
      cron TEXT NOT NULL,
      deviceAdresses TEXT NOT NULL,
      temperature REAL NOT NULL,
      oneTime BOOLEAN DEFAULT FALSE
    );
  `);

  /**
   * ALTER TABLE crons ADD oneTime BOOLEAN DEFAULT FALSE;
   */
};

const addCron = ({ cron, rfAdresses, temperature, name, oneTime }: StoreCron) => {
  if (!db) {
    throw new Error("DB not initialized");
  }
  db.query(
    "INSERT INTO crons (cron, deviceAdresses, temperature, name, oneTime) VALUES (?,?,?,?,?)",
    [
      cron,
      JSON.stringify(rfAdresses),
      temperature,
      name,
      oneTime
    ],
  );
};

const removeCron = (name: string) => {
  if (!db) {
    throw new Error("DB not initialized");
  }
  db.query("DELETE FROM crons WHERE name = ?", [name]);
};

const getCrons = (): StoreCron[] => {
  if (!db) {
    throw new Error("DB not initialized");
  }
  return db.query("SELECT cron, deviceAdresses, temperature, name, oneTime FROM crons")
    .map(
      ([cron, deviceAdresses, temperature, name, oneTime]): StoreCron => {
        return {
          cron: cron as string,
          rfAdresses: JSON.parse(deviceAdresses as string),
          temperature: temperature as number,
          name: name as string,
          oneTime: oneTime as boolean,
        };
      },
    );
};

const insert = (device: StoreDevice) => {
  if (!db) {
    throw new Error("DB not initialized");
  }
  db.query("INSERT INTO devices (rfAddress, name) VALUES (?, ?)", [
    device.rfAddress,
    device.name,
  ]);
};

const remove = (rfAddress: string) => {
  if (!db) {
    throw new Error("DB not initialized");
  }
  db.query("DELETE FROM devices WHERE rfAddress = ?", [rfAddress]);
};

const getAllDevices = (): StoreDevice[] => {
  if (!db) {
    throw new Error("DB not initialized");
  }
  return db.query("SELECT rfAddress, name FROM devices").map(
    ([rfAddress, name]): StoreDevice => {
      return {
        rfAddress: rfAddress as string,
        name: name as string,
      };
    },
  );
};

export const Database = {
  create,
  insert,
  remove,
  getAllDevices,
  addCron,
  getCrons,
  removeCron,
};
