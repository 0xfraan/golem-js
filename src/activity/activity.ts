import { Result, ResultState, StreamingBatchEvent } from "./results";
import EventSource from "eventsource";
import { Readable } from "stream";
import { Logger, YagnaApi, defaultLogger } from "../utils";
import sleep from "../utils/sleep";
import { ActivityFactory } from "./factory";
import { ActivityConfig } from "./config";
import { Events } from "../events";
import { Agreement } from "../agreement";
import { GolemError } from "../error/golem-error";

export enum ActivityStateEnum {
  New = "New",
  Initialized = "Initialized",
  Deployed = "Deployed",
  Ready = "Ready",
  Unresponsive = "Unresponsive",
  Terminated = "Terminated",
}

export interface ExeScriptRequest {
  text: string;
}

export interface ActivityOptions {
  /** timeout for sending and creating batch */
  activityRequestTimeout?: number;
  /** timeout for executing batch */
  activityExecuteTimeout?: number;
  /** interval for fetching batch results while polling */
  activityExeBatchResultPollIntervalSeconds?: number;
  /** Logger module */
  logger?: Logger;
  /** Event Bus implements EventTarget  */
  eventTarget?: EventTarget;
}

type AxiosError = Error & { response: { status: number }; code: string };
function isAxiosError(error: Error | AxiosError): error is AxiosError {
  return Boolean(error && "response" in error && typeof error.response === "object" && "status" in error.response);
}

/**
 * Activity module - an object representing the runtime environment on the provider in accordance with the `Package` specification.
 * As part of a given activity, it is possible to execute exe script commands and capture their results.
 */
export class Activity {
  private readonly logger: Logger;
  private isRunning = true;
  private currentState: ActivityStateEnum = ActivityStateEnum.New;
  private eventSource?: EventSource;

  /**
   * @param id activity ID
   * @param agreement Agreement
   * @param yagnaApi - {@link YagnaApi}
   * @param options - {@link ActivityOptions}
   * @hidden
   */
  constructor(
    public readonly id: string,
    public readonly agreement: Agreement,
    protected readonly yagnaApi: YagnaApi,
    protected readonly options: ActivityConfig,
  ) {
    this.logger = options?.logger || defaultLogger("golem-js:Activity");
  }

  /**
   * Create activity for given agreement ID
   *
   * @param agreement
   * @param yagnaApi
   * @param options - {@link ActivityOptions}
   * @param secure - defines if activity will be secure type
   * @return Activity
   */
  static async create(
    agreement: Agreement,
    yagnaApi: YagnaApi,
    options?: ActivityOptions,
    secure = false,
  ): Promise<Activity> {
    const factory = new ActivityFactory(agreement, yagnaApi, options);
    return factory.create(secure);
  }

  /**
   * Execute script
   *
   * @param script - exe script request
   * @param stream - define type of getting results from execution (polling or streaming)
   * @param timeout - execution timeout
   */
  public async execute(script: ExeScriptRequest, stream?: boolean, timeout?: number): Promise<Readable> {
    let batchId: string, batchSize: number;
    let startTime = new Date();

    try {
      batchId = await this.send(script);
      startTime = new Date();
      batchSize = JSON.parse(script.text).length;
    } catch (error) {
      this.logger.error("Execution of script failed.", {
        reason: error?.response?.data?.message || error.message || error,
      });
      throw new GolemError(error);
    }

    this.logger.info(`Script sent.`, { batchId });

    this.options.eventTarget?.dispatchEvent(
      new Events.ScriptSent({ activityId: this.id, agreementId: this.agreement.id }),
    );

    return stream
      ? this.streamingBatch(batchId, batchSize, startTime, timeout)
      : this.pollingBatch(batchId, startTime, timeout);
  }

  /**
   * Stop and destroy activity
   *
   * @return boolean
   */
  public async stop(): Promise<boolean> {
    this.isRunning = false;
    await this.end();
    return true;
  }

  /**
   * Getting current state of activity
   *
   * @return state
   * @throws Error when cannot query the state
   */
  public async getState(): Promise<ActivityStateEnum> {
    try {
      const { data } = await this.yagnaApi.activity.state.getActivityState(this.id);
      const state = data.state[0];
      if (this.currentState !== ActivityStateEnum[state]) {
        this.options.eventTarget?.dispatchEvent(
          new Events.ActivityStateChanged({ id: this.id, state: ActivityStateEnum[state] }),
        );
        this.currentState = ActivityStateEnum[state];
      }
      return ActivityStateEnum[state];
    } catch (error) {
      this.logger.error(`Cannot query activity state`, {
        reason: error?.response?.data?.message || error?.message || error,
      });
      throw error;
    }
  }

  protected async send(script: ExeScriptRequest): Promise<string> {
    const { data: batchId } = await this.yagnaApi.activity.control.exec(this.id, script, {
      timeout: this.options.activityRequestTimeout,
    });
    return batchId;
  }

  private async end() {
    this.eventSource?.close();
    await this.yagnaApi.activity.control
      .destroyActivity(this.id, this.options.activityRequestTimeout / 1000, {
        timeout: this.options.activityRequestTimeout + 1000,
      })
      .catch((error) => {
        throw new GolemError(
          `Unable to destroy activity ${this.id}. ${error?.response?.data?.message || error?.message || error}`,
        );
      });
    this.options.eventTarget?.dispatchEvent(
      new Events.ActivityDestroyed({ id: this.id, agreementId: this.agreement.id }),
    );
    this.logger.info(`Activity destroyed`, { id: this.id });
  }

  private async pollingBatch(batchId: string, startTime: Date, timeout?: number): Promise<Readable> {
    this.logger.info("Starting to poll for batch results");
    let isBatchFinished = false;
    let lastIndex: number;
    let retryCount = 0;
    const maxRetries = 5;
    const { id: activityId, agreement, logger } = this;
    const isRunning = () => this.isRunning;
    const { activityExecuteTimeout, eventTarget, activityExeBatchResultPollIntervalSeconds } = this.options;
    const api = this.yagnaApi.activity;
    const handleError = this.handleError.bind(this);

    return new Readable({
      objectMode: true,

      async read() {
        while (!isBatchFinished) {
          logger.info("Polling for batch script execution result");

          if (startTime.valueOf() + (timeout || activityExecuteTimeout) <= new Date().valueOf()) {
            logger.info("Activity probably timed-out, will stop polling for batch execution results");
            return this.destroy(new GolemError(`Activity ${activityId} timeout.`));
          }

          if (!isRunning()) {
            logger.info("Activity is no longer running, will stop polling for batch execution results");
            return this.destroy(new GolemError(`Activity ${activityId} has been interrupted.`));
          }

          try {
            logger.info("Trying to poll for batch execution results from yagna");
            // This will ignore "incompatibility" between ExeScriptCommandResultResultEnum and ResultState, which both
            // contain exactly the same entries, however TSC refuses to compile it as it assumes the former is dynamically
            // computed.
            const { data: rawExecBachResults } = await api.control.getExecBatchResults(
              activityId,
              batchId,
              undefined,
              activityExeBatchResultPollIntervalSeconds,
              {
                timeout: 0,
              },
            );
            retryCount = 0;

            const newResults = rawExecBachResults.map((rawResult) => new Result(rawResult)).slice(lastIndex + 1);

            logger.info(`Received batch execution results`, { results: newResults });

            if (Array.isArray(newResults) && newResults.length) {
              newResults.forEach((result) => {
                this.push(result);
                isBatchFinished = result.isBatchFinished || false;
                lastIndex = result.index;
              });
            }
          } catch (error) {
            logger.error(`Processing batch execution results failed`, error);

            try {
              retryCount = await handleError(error, lastIndex, retryCount, maxRetries);
            } catch (error) {
              eventTarget?.dispatchEvent(
                new Events.ScriptExecuted({ activityId, agreementId: agreement.id, success: false }),
              );
              return this.destroy(new GolemError(`Unable to get activity results. ${error?.message || error}`));
            }
          }
        }

        eventTarget?.dispatchEvent(new Events.ScriptExecuted({ activityId, agreementId: agreement.id, success: true }));
        this.push(null);
      },
    });
  }

  private async streamingBatch(
    batchId: string,
    batchSize: number,
    startTime: Date,
    timeout?: number,
  ): Promise<Readable> {
    const basePath = this.yagnaApi.activity.control["basePath"];
    const apiKey = this.yagnaApi.yagnaOptions.apiKey;

    const eventSource = new EventSource(`${basePath}/activity/${this.id}/exec/${batchId}`, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    eventSource.addEventListener("runtime", (event) => results.push(this.parseEventToResult(event.data, batchSize)));
    eventSource.addEventListener("error", (error) => errors.push(error.data?.message ?? error));
    this.eventSource = eventSource;

    let isBatchFinished = false;
    const activityId = this.id;
    const isRunning = () => this.isRunning;
    const activityExecuteTimeout = this.options.activityExecuteTimeout;
    const { logger } = this;

    const errors: object[] = [];
    const results: Result[] = [];

    return new Readable({
      objectMode: true,
      async read() {
        while (!isBatchFinished) {
          let error: Error | undefined;
          if (startTime.valueOf() + (timeout || activityExecuteTimeout) <= new Date().valueOf()) {
            logger.info("Activity probably timed-out, will stop streaming batch execution results");
            error = new GolemError(`Activity ${activityId} timeout.`);
          }

          if (!isRunning()) {
            logger.info("Activity is no longer running, will stop streaming batch execution results");
            error = new GolemError(`Activity ${activityId} has been interrupted.`);
          }

          if (errors.length) {
            error = new GolemError(`GetExecBatchResults failed due to errors: ${JSON.stringify(errors)}`);
          }
          if (error) {
            eventSource?.close();
            return this.destroy(error);
          }

          if (results.length) {
            const result = results.shift();
            this.push(result);
            isBatchFinished = result?.isBatchFinished || false;
          }
          await sleep(500, true);
        }

        this.push(null);
        eventSource?.close();
      },
    });
  }

  private async handleError(error: Error, cmdIndex: number, retryCount: number, maxRetries: number) {
    if (this.isTimeoutError(error)) {
      this.logger.error("API request timeout.", error);
      return retryCount;
    }

    const { terminated, reason, errorMessage } = await this.isTerminated();

    if (terminated) {
      const msg = (reason || "") + (errorMessage || "");
      this.logger.error(`Activity terminated by provider.`, { reason: msg, id: this.id });
      throw error;
    }

    ++retryCount;

    const failMsg = "There was an error retrieving activity results.";

    if (retryCount < maxRetries) {
      this.logger.info(`${failMsg} Retrying in ${this.options.activityExeBatchResultPollIntervalSeconds} seconds.`);
      return retryCount;
    } else {
      this.logger.error(`${failMsg} Giving up after ${retryCount} attempts.`, error);
    }

    throw new GolemError(`Command #${cmdIndex || 0} getExecBatchResults error: ${error.message}`);
  }

  private isTimeoutError(error: Error | AxiosError) {
    if (!isAxiosError(error)) return false;
    const timeoutMsg = error.message && error.message.includes("timeout");
    return (
      (error.response && error.response.status === 408) ||
      error.code === "ETIMEDOUT" ||
      (error.code === "ECONNABORTED" && timeoutMsg)
    );
  }

  private async isTerminated(): Promise<{ terminated: boolean; reason?: string; errorMessage?: string }> {
    try {
      const { data } = await this.yagnaApi.activity.state.getActivityState(this.id);
      const state = ActivityStateEnum[data?.state?.[0]];
      return {
        terminated: state === ActivityStateEnum.Terminated,
        reason: data?.reason,
        errorMessage: data?.errorMessage,
      };
    } catch (err) {
      this.logger.info(`Cannot query activity state:`, err);
      return { terminated: false };
    }
  }

  private parseEventToResult(msg: string, batchSize: number): Result {
    try {
      const event: StreamingBatchEvent = JSON.parse(msg);
      // StreamingBatchEvent has a slightly more extensive structure,
      // including a return code that could be added to the Result entity... (?)
      return new Result({
        index: event.index,
        eventDate: event.timestamp,
        result: event?.kind?.finished
          ? event?.kind?.finished?.return_code === 0
            ? ResultState.Ok
            : ResultState.Error
          : event?.kind?.stderr
            ? ResultState.Error
            : ResultState.Ok,
        stdout: event?.kind?.stdout,
        stderr: event?.kind?.stderr,
        message: event?.kind?.finished?.message,
        isBatchFinished: event.index + 1 >= batchSize && Boolean(event?.kind?.finished),
      });
    } catch (error) {
      throw new GolemError(`Cannot parse ${msg} as StreamingBatchEvent`);
    }
  }
}
