import { GftpStorageProvider } from "./gftp";
import { WebSocketBrowserStorageProvider } from "./ws-browser";
import { NullStorageProvider } from "./null";
import { Logger, YagnaApi } from "../utils";
export declare function createDefaultStorageProvider(yagnaApi: YagnaApi, logger?: Logger): GftpStorageProvider | NullStorageProvider | WebSocketBrowserStorageProvider;
