import { StorageProvider, StorageProviderDataCallback } from "./provider";
import { Logger, YagnaApi } from "../utils";
export interface WebSocketStorageProviderOptions {
    logger?: Logger;
}
/**
 * Storage provider that uses GFTP over WebSockets.
 */
export declare class WebSocketBrowserStorageProvider implements StorageProvider {
    private readonly yagnaApi;
    private readonly options;
    /**
     * Map of open services (IDs) indexed by GFTP url.
     */
    private services;
    private logger;
    private ready;
    constructor(yagnaApi: YagnaApi, options: WebSocketStorageProviderOptions);
    close(): Promise<void>;
    init(): Promise<void>;
    publishData(data: Uint8Array): Promise<string>;
    publishFile(): Promise<string>;
    receiveData(callback: StorageProviderDataCallback): Promise<string>;
    receiveFile(): Promise<string>;
    release(urls: string[]): Promise<void>;
    isReady(): boolean;
    private createFileInfo;
    private createSocket;
    private createService;
    private deleteService;
    private respond;
    private completeReceive;
}
