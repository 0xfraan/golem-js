import { StorageProvider } from "./provider";
import { Logger, runtimeContextChecker } from "../utils";
import path from "path";
import fs from "fs";
import cp from "child_process";
import readline from "node:readline/promises";

export class GftpStorageProvider implements StorageProvider {
  private gftpServerProcess?: cp.ChildProcess;
  private readline?: readline.Interface;

  /**
   * All published URLs to be release on close().
   * @private
   */
  private publishedUrls = new Set<string>();

  private isInitialized = false;

  constructor(private logger?: Logger) {
    if (runtimeContextChecker.isBrowser) {
      throw new Error(`File transfer by GFTP module is unsupported in the browser context.`);
    }
  }

  async init() {
    if (this.isInitialized) {
      this.logger?.warn("GFTP init attempted even though it was already ready - check the logic of your application");
      return;
    }

    await this.startGftpServer();
    this.logger?.info(`GFTP Version: ${await this.jsonrpc("version")}`);
  }

  private startGftpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger?.debug("Starting GFTP server");

      this.gftpServerProcess = cp.spawn("gftp", ["server"]);

      this.gftpServerProcess.on("spawn", () => {
        this.logger?.info("GFTP server spawned");
        this.isInitialized = true;
        resolve();
      });

      this.gftpServerProcess.on("error", (error) => {
        this.logger?.error("Error while spawning GFTP server" + error);
        reject(error);
      });

      this.gftpServerProcess?.stdout?.setEncoding("utf-8");
      this.gftpServerProcess?.stderr?.setEncoding("utf-8");
      if (this.gftpServerProcess?.stdout && this.gftpServerProcess?.stdin) {
        this.readline = readline.createInterface(this.gftpServerProcess.stdout, this.gftpServerProcess.stdin);
      }
    });
  }

  isInitiated() {
    return !!this.gftpServerProcess;
  }

  private async generateTempFileName(): Promise<string> {
    const { randomUUID } = await import("crypto");
    const tmp = await import("tmp");
    const file_name = path.join(tmp.dirSync().name, randomUUID().toString());
    if (fs.existsSync(file_name)) fs.unlinkSync(file_name);
    return file_name;
  }

  async receiveFile(path: string): Promise<string> {
    const { url } = await this.jsonrpc("receive", { output_file: path });
    return url;
  }

  receiveData(): Promise<string> {
    throw new Error("receiveData is not implemented in GftpStorageProvider");
  }

  async publishFile(src: string): Promise<string> {
    const url = await this.uploadFile(src);
    this.publishedUrls.add(url);
    return url;
  }

  async publishData(src: Uint8Array): Promise<string> {
    let url: string;
    if (Buffer.isBuffer(src)) {
      url = await this.uploadBytes(src);
    } else {
      url = await this.uploadBytes(Buffer.from(src));
    }

    this.publishedUrls.add(url);
    return url;
  }

  release(): Promise<void> {
    // NOTE: Due to GFTP's handling of file Ids (hashes), all files with same content will share IDs, so releasing
    // one might break transfer of another one. Therefore, we release all files on close().
    return Promise.resolve(undefined);
  }

  private async releaseAll(): Promise<void> {
    const urls = Array.from(this.publishedUrls).filter((url) => !!url);
    if (!urls.length) {
      return;
    }
    await this.jsonrpc("close", { urls });
  }

  async close() {
    await this.releaseAll();
    this.readline?.close();
    this.gftpServerProcess?.kill();
  }

  private async jsonrpc(method: string, params: object = {}) {
    if (!this.isInitiated()) await this.init();
    const paramsStr = JSON.stringify(params);
    const query = `{"jsonrpc": "2.0", "id": "1", "method": "${method}", "params": ${paramsStr}}\n`;
    let valueStr = "";
    try {
      const value = await this.readline?.question(query);
      if (!value) throw "Unable to get GFTP command result";
      const { result } = JSON.parse(value);
      valueStr = value;
      if (result === undefined) throw value;
      return result;
    } catch (error) {
      throw Error(
        `Error while obtaining response to JSONRPC. query: ${query} value: ${valueStr} error: ${JSON.stringify(error)}`,
      );
    }
  }

  private async uploadStream(stream: AsyncGenerator<Buffer>): Promise<string> {
    // FIXME: temp file is never deleted.
    const file_name = await this.generateTempFileName();
    const wStream = fs.createWriteStream(file_name, {
      encoding: "binary",
    });
    // eslint-disable-next-line no-async-promise-executor
    await new Promise(async (fulfill) => {
      wStream.once("finish", fulfill);
      for await (const chunk of stream) {
        wStream.write(chunk);
      }
      wStream.end();
    });
    const links = await this.jsonrpc("publish", { files: [file_name.toString()] });
    if (links.length !== 1) throw "invalid gftp publish response";
    return links[0]?.url;
  }

  private async uploadBytes(data: Buffer): Promise<string> {
    return await this.uploadStream(
      (async function* () {
        yield data;
      })(),
    );
  }

  private async uploadFile(file: string): Promise<string> {
    const links = await this.jsonrpc("publish", { files: [file.toString()] });
    return links[0]?.url;
  }
}
