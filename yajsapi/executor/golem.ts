import { MarketStrategy } from "./strategy";
import { Package } from "../package";
import { WorkContext } from "./work_context";

type GolemOptions =
  | string
  | {
      package: string | Package;
      max_workers?: number;
      timeout?: number;
      budget?: number;
      strategy?: MarketStrategy;
      subnet_tag?: string;
      driver?: string;
      network?: string;
      payment_driver?: string;
      payment_network?: string;
      event_consumer?: string;
      network_address?: string;
    };

type Worker<T = unknown, O = string | void> = (ctx: WorkContext, data: T) => Promise<O>;

const DEFAULT_OPTIONS = {
  max_workers: 5,
  timeout: 0,
  budget: 0,
  strategy: null,
  subnet_tag: "devnet-beta",
  driver: "erc20",
  network: null,
  payment_driver: "erc20",
  payment_network: "rinkeby",
  event_consumer: null,
  network_address: "192.169.0.0/24",
};

export class Golem {
  private package: Package;
  constructor(options: GolemOptions) {
    this.package = typeof options === "string" ? this.createPackage(options) : (options.package as Package);
    for (const key in DEFAULT_OPTIONS) {
      this[key] = options[key] ?? process.env?.[key.toUpperCase()] ?? DEFAULT_OPTIONS[key];
    }
  }
  async beforeEach(worker: Worker) {
    // todo
  }
  async run(worker: Worker) {
    // todo
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  map<T, O>(iterable: Iterable<T>, worker: Worker<T, O>): AsyncIterable<O> {
    // todo
  }
  async end() {
    // todo
  }

  private createPackage(image_hash: string): Package {
    // todo
    return new Package();
  }
}
