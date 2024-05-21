import { EventEmitter } from "eventemitter3";
import { Network } from "./network";
import { GolemNetworkError, NetworkErrorCode } from "./error";
import { Logger } from "../shared/utils";
import { INetworkApi } from "./api";
import { NetworkNode } from "./node";
import { IPv4, IPv4CidrRange, IPv4Mask } from "ip-num";

export interface NetworkEvents {}

export interface NetworkOptions {
  /** the ID of the network */
  id?: string;
  /** the IP address of the network. May contain netmask, e.g. "192.168.0.0/24" */
  ip?: string;
  /** the desired IP address of the requestor node within the newly-created network */
  ownerIp?: string;
  /** optional netmask (only if not provided within the `ip` argument) */
  mask?: string;
  /** optional gateway address for the network */
  gateway?: string;
}

export interface NetworkModule {
  events: EventEmitter<NetworkEvents>;
  createNetwork(options?: NetworkOptions): Promise<Network>;
  removeNetwork(network: Network): Promise<void>;
  createNetworkNode(network: Network, nodeId: string, nodeIp?: string): Promise<NetworkNode>;
  removeNetworkNode(network: Network, node: NetworkNode): Promise<void>;
  getWebsocketUri(networkNode: NetworkNode, port: number): string;
}

export class NetworkModuleImpl implements NetworkModule {
  events: EventEmitter<NetworkEvents> = new EventEmitter<NetworkEvents>();

  constructor(
    private readonly deps: {
      logger: Logger;
      networkApi: INetworkApi;
    },
  ) {}

  async createNetwork(options?: NetworkOptions): Promise<Network> {
    try {
      const ipDecimalDottedString = options?.ip?.split("/")?.[0] || "192.168.0.0";
      const maskBinaryNotation = parseInt(options?.ip?.split("/")?.[1] || "24");
      const maskPrefix = options?.mask ? IPv4Mask.fromDecimalDottedString(options.mask).prefix : maskBinaryNotation;
      const ipRange = IPv4CidrRange.fromCidr(`${IPv4.fromString(ipDecimalDottedString)}/${maskPrefix}`);
      const ip = ipRange.getFirst();
      const mask = ipRange.getPrefix().toMask();
      const gateway = options?.gateway ? new IPv4(options.gateway) : undefined;
      const network = await this.deps.networkApi.createNetwork({
        id: options?.id,
        ip: ip.toString(),
        mask: mask?.toString(),
        gateway: gateway?.toString(),
      });
      // add Requestor as network node
      const requestorId = await this.deps.networkApi.getIdentity();
      await this.createNetworkNode(network, requestorId, options?.ownerIp);
      this.deps.logger.info(`Network created`, network.getNetworkInfo());
      return network;
    } catch (error) {
      if (error instanceof GolemNetworkError) {
        throw error;
      }
      throw new GolemNetworkError(
        `Unable to create network. ${error?.response?.data?.message || error}`,
        NetworkErrorCode.NetworkCreationFailed,
        undefined,
        error,
      );
    }
  }
  async removeNetwork(network: Network): Promise<void> {
    try {
      await this.deps.networkApi.removeNetwork(network);
      this.deps.logger.info(`Network removed`, network.getNetworkInfo());
    } catch (error) {
      throw new GolemNetworkError(
        `Unable to remove network. ${error}`,
        NetworkErrorCode.NetworkRemovalFailed,
        undefined,
        error,
      );
    }
  }
  async createNetworkNode(network: Network, nodeId: string, nodeIp?: string): Promise<NetworkNode> {
    try {
      if (!network.isNodeIdUnique(nodeId)) {
        throw new GolemNetworkError(
          `Network ID '${nodeId}' has already been assigned in this network.`,
          NetworkErrorCode.AddressAlreadyAssigned,
          network.getNetworkInfo(),
        );
      }
      let ipv4: IPv4;
      if (nodeIp) {
        ipv4 = IPv4.fromString(nodeIp);
        if (!network.isIpInNetwork(ipv4)) {
          throw new GolemNetworkError(
            `The given IP ('${nodeIp}') address must belong to the network ('${network.getNetworkInfo().ip}').`,
            NetworkErrorCode.AddressOutOfRange,
            network.getNetworkInfo(),
          );
        }
        if (!network.isNodeIpUnique(ipv4)) {
          throw new GolemNetworkError(
            `IP '${nodeIp.toString()}' has already been assigned in this network.`,
            NetworkErrorCode.AddressAlreadyAssigned,
            network.getNetworkInfo(),
          );
        }
      } else {
        ipv4 = network.getFirstAvailableIpAddress();
      }
      const node = await this.deps.networkApi.createNetworkNode(network, nodeId, ipv4.toString());
      network.addNode(node);
      this.deps.logger.info(`Node has been added to the network.`, { id: nodeId, ip: ipv4.toString() });
      return node;
    } catch (error) {
      if (error instanceof GolemNetworkError) {
        throw error;
      }
      throw new GolemNetworkError(
        `Unable to add node to network. ${error?.data?.message || error.toString()}`,
        NetworkErrorCode.NodeAddingFailed,
        network.getNetworkInfo(),
        error,
      );
    }
  }
  async removeNetworkNode(network: Network, node: NetworkNode): Promise<void> {
    if (!network.hasNode(node)) {
      throw new GolemNetworkError(
        `The network node ${node.id} does not belong to the network`,
        NetworkErrorCode.NodeRemovalFailed,
        network.getNetworkInfo(),
      );
    }
    try {
      await this.deps.networkApi.removeNetworkNode(network, node);
      network.removeNode(node);
      this.deps.logger.info(`Node has been removed from the network.`, {
        network: network.getNetworkInfo().ip,
        nodeIp: node.ip,
      });
    } catch (error) {
      if (error instanceof GolemNetworkError) {
        throw error;
      }
      throw new GolemNetworkError(
        `Unable to remove network node. ${error}`,
        NetworkErrorCode.NodeRemovalFailed,
        network.getNetworkInfo(),
        error,
      );
    }
  }

  getWebsocketUri(networkNode: NetworkNode, port: number): string {
    return this.deps.networkApi.getWebsocketUri(networkNode, port);
  }
}
