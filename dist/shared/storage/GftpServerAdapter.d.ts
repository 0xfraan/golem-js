import { FileServerEntry, IFileServer } from "../../activity";
import { StorageProvider } from "./provider";
/**
 * This class provides GFTP based implementation of the IFileServer interface used in the SDK
 */
export declare class GftpServerAdapter implements IFileServer {
    private readonly storage;
    private published;
    constructor(storage: StorageProvider);
    publishFile(sourcePath: string): Promise<{
        fileUrl: string;
        fileHash: string;
    }>;
    isServing(): boolean;
    getPublishInfo(sourcePath: string): FileServerEntry | undefined;
    isFilePublished(sourcePath: string): boolean;
    private calculateFileHash;
}
