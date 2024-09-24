import { NetworkInfo } from "./network";
/**
 * Describes a node in a VPN, mapping a Golem node id to an IP address
 */
export declare class NetworkNode {
    readonly id: string;
    readonly ip: string;
    getNetworkInfo: () => NetworkInfo;
    yagnaBaseUri: string;
    constructor(id: string, ip: string, getNetworkInfo: () => NetworkInfo, yagnaBaseUri: string);
    /**
     * Generate a dictionary of arguments that are required for the appropriate
     *`Deploy` command of an exescript in order to pass the network configuration to the runtime
     * on the provider's end.
     */
    getNetworkConfig(): {
        net: {
            nodeIp: string;
            id: string;
            ip: string;
            mask: string;
            gateway?: string | undefined;
            nodes: {
                [ip: string]: string;
            }; /**
             * Generate a dictionary of arguments that are required for the appropriate
             *`Deploy` command of an exescript in order to pass the network configuration to the runtime
             * on the provider's end.
             */
        }[];
    };
    getWebsocketUri(port: number): string;
}
