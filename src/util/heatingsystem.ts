// Import necessary modules
import {
  decode,
  encode,
} from "https://deno.land/std@0.196.0/encoding/base64.ts";

// Define types for messages
export type Mode = "auto" | "manual" | "vacation" | "boost";

export interface Device {
  rfAddress: string;
  targetTemperature?: number;
  measuredTemperature?: number;
  valvePosition?: number;
}

export interface CubeInfo {
  serialNumber: string;
  rfAddress: string;
  firmwareVersion: string;
  dutyCycle: string;
  freeMemorySlots: string;
}

// HeatingSystemController class
export class HeatingSystemController {
  private host: string;
  private port: number;
  private socket: Deno.Conn | null = null;

  constructor(host: string, port: number = 62910) {
    this.host = host;
    this.port = port;
  }

  // Connect to the heating system
  async connect(): Promise<string> {
    this.socket = await Deno.connect({ hostname: this.host, port: this.port });
    let info = '';
    while (true) {
      const response = await this.receiveMessage();
      if (response.startsWith("H:")) {
        info = response;
      }
      if (response.startsWith("L:")) {
        return info;
      }
    }
  }

  // Disconnect from the heating system
  async disconnect() {
    if (this.socket) {
      await this.sendMessage("q:");
      this.socket.close();
      this.socket = null;
    }
  }

  // Send a message to the heating system
  private async sendMessage(message: string) {
    if (!this.socket) {
      throw new Error("Not connected");
    }
    const data = new TextEncoder().encode(message + "\r\n");
    await this.socket.write(data);
  }

  // Receive a message from the heating system
  private async receiveMessage(): Promise<string> {
    if (!this.socket) {
      throw new Error("Not connected");
    }
    const buffer = new Uint8Array(1024);
    const n = await this.socket.read(buffer);
    if (n === null) {
      throw new Error("Connection closed");
    }
    return new TextDecoder().decode(buffer.subarray(0, n));
  }

  // Send a command and receive the response
  private async sendCommand(command: string): Promise<string> {
    await this.sendMessage(command);
    return await this.receiveMessage();
  }

  // Get configuration (C Message)
  async getConfiguration(): Promise<{ address: string; configData: string }> {
    await this.sendMessage("c:");
    const response = await this.receiveMessage();
    const [address, configData] = response.slice(2).split(",");
    return { address, configData };
  }

  // Get device list (L Message)
  async getDeviceList(): Promise<Device[]> {
    await this.sendMessage("l:");
    const response = await this.receiveMessage();
    console.log('l response', response)
    const base64Data = response.slice(2).trim();
    const decodedData = decode(base64Data);
    const devices: Device[] = [];

    const hasMoreData = this.bytesToDecimal(decodedData.slice(0, 1)) > 6;

    for (let i = 0; i < decodedData.length; i += 12) {
      const rfAddress = this.bytesToHex(decodedData.slice(i + 1, i + 4));
      let device: Device = {
        rfAddress,
      };
      if (hasMoreData) {
        const tempBytes = decodedData.slice(i + 8, i + 9);
        const temperature = this.bytesToDecimal(tempBytes) / 2;
        const msrdTempBytes = decodedData.slice(i + 9, i + 11);
        const measuredTemperature =
          (msrdTempBytes[0] * 256 + msrdTempBytes[1]) /
          10;
        const valvePosition = this.bytesToDecimal(
          decodedData.slice(i + 7, i + 8),
        );
        device = {
          ...device,
          targetTemperature: temperature,
          measuredTemperature: measuredTemperature,
          valvePosition: valvePosition,
        };
      }
      devices.push(device);
    }

    console.log(devices)

    return devices;
  }

  newDevice(): Promise<{ rfAddress: string }> {
    return new Promise<{ rfAddress: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout"));
      }, 59000);
      this.sendMessage("n:003c").then(() => {
        this.receiveMessage().then((response) => {
          clearTimeout(timeout);
          const base64Data = response.slice(2).trim();
          const decodedData = decode(base64Data);
          const rfAddressBytes = decodedData.slice(1, 4);
          resolve({
            rfAddress: this.bytesToHex(rfAddressBytes),
          });
        });
      });
    });
  }

  async deleteDevices(
    rfAddresses: string[],
    force: boolean = false,
  ): Promise<void> {
    const numberOfDevices = rfAddresses.length.toString(16).padStart(2, "0");
    const forceFlag = force ? "1" : "0";
    const rfAddressesBytes = rfAddresses.flatMap((address) =>
      this.rfAddressToBytes(address)
    );
    const rfAddressesBase64 = encode(new Uint8Array(rfAddressesBytes));
    const message = `t:${numberOfDevices},${forceFlag},${rfAddressesBase64}`;
    await this.sendCommand(message)
  }

  // Get cube information (H Message)
  getCubeInfo(data: string): CubeInfo {
    const parts = data.slice(2).split(",");
    return {
      serialNumber: parts[0],
      rfAddress: parts[1],
      firmwareVersion: parseInt(parts[2], 16).toString(),
      dutyCycle: parts[5],
      freeMemorySlots: parts[6],
    };
  }

  // Set temperature (S Message)
  async setTemperature(
    rfAddress: string,
    temperature: number,
    mode: Mode = "manual",
  ): Promise<void> {
    const command = 0x40; // Command 40: Set temperature
    const rfFlags = 0x00; // RF flags
    const fromAddress = [0x00, 0x00, 0x00]; // RF Address from
    const toAddress = this.rfAddressToBytes(rfAddress); // RF Address to
    const roomId = 0x00; // Room ID
    const modeBits = this.getModeBits(mode);
    const tempValue = Math.round(temperature * 2);
    const temperatureByte = (modeBits << 6) | tempValue;

    const payload = new Uint8Array([
      0x00, // Unknown
      rfFlags,
      command,
      ...fromAddress,
      ...toAddress,
      roomId,
      temperatureByte,
    ]);

    const payloadBase64 = encode(payload);
    const message = `s:${payloadBase64}`;
    const cmd = await this.sendCommand(message);
    console.log('cmd', cmd)
  }

  // Helper to convert RF address string to bytes
  private rfAddressToBytes(rfAddress: string): number[] {
    const addressNum = parseInt(rfAddress, 16);
    return [
      (addressNum >> 16) & 0xff,
      (addressNum >> 8) & 0xff,
      addressNum & 0xff,
    ];
  }

  // Helper to convert bytes to hex string
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  // Helper to get mode bits
  private getModeBits(mode: Mode): number {
    switch (mode) {
      case "auto":
        return 0b00;
      case "manual":
        return 0b01;
      case "vacation":
        return 0b10;
      case "boost":
        return 0b11;
      default:
        return 0b00;
    }
  }

  private bytesToDecimal(bytes: Uint8Array): number {
    let decimal = 0;
    for (let i = 0; i < bytes.length; i++) {
      decimal = (decimal << 8) | bytes[i];
    }
    return decimal;
  }

  async wakeUp(rfAddress: string, duration: number = 30): Promise<string> {
    const durationHex = duration.toString(16).padStart(2, "0");
    const rfAddressBytes = this.rfAddressToBytes(rfAddress);
    const rfAddressHex = rfAddressBytes
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const message = `z:${durationHex},D,${rfAddressHex}`;
    console.log(message)
    const answer = await this.sendCommand(message);
    return answer
  }
}

export const controller: HeatingSystemController = new HeatingSystemController(
  "192.168.0.153",
);
