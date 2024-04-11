import * as YaTsClient from "ya-ts-client";
import * as EnvUtils from "../env";
import { GolemConfigError, GolemPlatformError } from "../../error/golem-error";
import { v4 } from "uuid";
import { Logger } from "../logger/logger";
import { defaultLogger } from "../logger/defaultLogger";

// .js added for ESM compatibility
import semverSatisfies from "semver/functions/satisfies.js";
import semverCoerce from "semver/functions/coerce.js";

export type YagnaOptions = {
  apiKey?: string;
  basePath?: string;
  logger?: Logger;
};

export const MIN_SUPPORTED_YAGNA = "0.13.2";

/**
 * Utility class that groups various Yagna APIs under a single wrapper
 */
export class YagnaApi {
  public readonly appSessionId: string;

  public readonly yagnaOptions: YagnaOptions;

  private readonly logger: Logger;

  /**
   * Base path used to build paths to Yagna's API
   *
   * @example http://localhost:7465
   */
  public readonly basePath: string;

  public readonly identity: YaTsClient.IdentityApi.DefaultService;

  public market: YaTsClient.MarketApi.RequestorService;

  public activity: {
    control: YaTsClient.ActivityApi.RequestorControlService;
    state: YaTsClient.ActivityApi.RequestorStateService;
  };

  public net: YaTsClient.NetApi.RequestorService;

  public payment: YaTsClient.PaymentApi.RequestorService;

  public gsb: YaTsClient.GsbApi.RequestorService;

  public version: YaTsClient.VersionApi.DefaultService;

  constructor(options?: YagnaOptions) {
    const apiKey = options?.apiKey || EnvUtils.getYagnaAppKey();
    this.basePath = options?.basePath || EnvUtils.getYagnaApiUrl();

    const yagnaOptions: Pick<YagnaOptions, "apiKey" | "basePath"> = {
      apiKey: apiKey,
      basePath: this.basePath,
    };

    if (!yagnaOptions.apiKey) {
      throw new GolemConfigError("Yagna API key not defined");
    }

    const commonHeaders = {
      Authorization: `Bearer ${apiKey}`,
    };

    const marketClient = new YaTsClient.MarketApi.Client({
      BASE: `${this.basePath}/market-api/v1`,
      HEADERS: commonHeaders,
    });

    this.market = marketClient.requestor;

    const paymentClient = new YaTsClient.PaymentApi.Client({
      BASE: `${this.basePath}/payment-api/v1`,
      HEADERS: commonHeaders,
    });

    this.payment = paymentClient.requestor;

    const z = new YaTsClient.ActivityApi.Client({
      BASE: `${this.basePath}/activity-api/v1`,
      HEADERS: commonHeaders,
    });

    this.activity = {
      control: z.requestorControl,
      state: z.requestorState,
    };

    const netClient = new YaTsClient.NetApi.Client({
      BASE: `${this.basePath}/net-api/v1`,
      HEADERS: commonHeaders,
    });

    this.net = netClient.requestor;

    const gsbClient = new YaTsClient.GsbApi.Client({
      BASE: `${this.basePath}/gsb-api/v1`,
      HEADERS: commonHeaders,
    });

    this.gsb = gsbClient.requestor;

    this.logger = options?.logger ?? defaultLogger("yagna");

    const identityClient = new YaTsClient.IdentityApi.Client({
      BASE: this.basePath,
      HEADERS: commonHeaders,
    });
    this.identity = identityClient.default;

    const versionClient = new YaTsClient.VersionApi.Client({
      BASE: this.basePath,
    });
    this.version = versionClient.default;

    this.yagnaOptions = yagnaOptions;

    this.appSessionId = v4();
  }

  async connect() {
    this.logger.info("Connecting to yagna");
    await this.assertSupportedVersion();
    return this.identity.getIdentity();
  }

  private async assertSupportedVersion() {
    this.logger.debug("Checking yagna version support");
    const version = await this.getVersion();

    const normVersion = semverCoerce(version);
    if (!normVersion) {
      throw new GolemPlatformError(
        `Unreadable yana version '${version}'. Can't proceed without checking yagna version support status.`,
      );
    }

    if (!semverSatisfies(normVersion, `>=${MIN_SUPPORTED_YAGNA}`)) {
      throw new GolemPlatformError(
        `You run yagna in version ${version} and the minimal version supported by the SDK is ${MIN_SUPPORTED_YAGNA}. ` +
          `Please consult the golem-js README to find matching SDK version or upgrade your yagna installation.`,
      );
    }

    return normVersion.version;
  }

  public async getVersion(): Promise<string> {
    try {
      const res = await this.version.getVersion();
      return res.current.version;
    } catch (err) {
      throw new GolemPlatformError(`Failed to establish yagna version due to: ${err}`, err);
    }
  }
}

export interface YagnaEventSubscription<T> {
  waitFor(matcher: (event: T) => boolean, opts: { timeout: number }): Promise<T>;

  on(cb: (event: T) => void): void;

  filter(matcher: (event: T) => boolean): YagnaEventSubscription<T>;

  batch(cb: (event: T[]) => void, options?: { timeout: number }): void;

  /** Stops the subscription, resolves when all I/O is closed */
  cancel(): Promise<void>;
}
