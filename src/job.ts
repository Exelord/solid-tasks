import { onCleanup } from "solid-js";
import { createObject } from "solid-proxies";
import { Task } from "./task";

export type TaskFunction<T, Args extends unknown[]> = (
  signal: AbortSignal,
  ...args: Args
) => Promise<T>;

export enum JobStatus {
  Idle = "idle",
  Pending = "pending",
}

export enum JobMode {
  Drop = "drop",
  Restart = "restart",
}

export interface JobOptions {
  mode?: JobMode;
}

interface ReactiveState<T> {
  status: JobStatus;
  performCount: number;
  lastPending?: Task<T>;
  lastFulfilled?: Task<T>;
  lastRejected?: Task<T>;
  lastSettled?: Task<T>;
}

export class Job<T, Args extends unknown[]> {
  get status(): ReactiveState<T>["status"] {
    return this.#reactiveState.status;
  }

  get isIdle(): boolean {
    return this.status === JobStatus.Idle;
  }

  get isPending(): boolean {
    return this.status === JobStatus.Pending;
  }

  get lastPending(): ReactiveState<T>["lastPending"] {
    return this.#reactiveState.lastPending;
  }

  get lastFulfilled(): ReactiveState<T>["lastFulfilled"] {
    return this.#reactiveState.lastFulfilled;
  }

  get lastRejected(): ReactiveState<T>["lastRejected"] {
    return this.#reactiveState.lastRejected;
  }

  get lastSettled(): ReactiveState<T>["lastSettled"] {
    return this.#reactiveState.lastSettled;
  }

  get performCount(): ReactiveState<T>["performCount"] {
    return this.#reactiveState.performCount;
  }

  #taskFn: TaskFunction<T, Args>;
  #options: JobOptions;

  #reactiveState: ReactiveState<T> = createObject({
    status: JobStatus.Idle,
    performCount: 0,
  });

  constructor(taskFn: TaskFunction<T, Args>, options: JobOptions = {}) {
    options.mode ??= JobMode.Drop;
    this.#taskFn = taskFn;
    this.#options = options;
  }

  perform(...args: Args): Task<T> {
    const task = new Task<T>((signal) => this.#taskFn(signal, ...args));
    this.#reactiveState.performCount++;

    if (this.lastPending) {
      if (this.#options.mode === JobMode.Drop) {
        task.cancel();
        return task;
      }

      if (this.#options.mode === JobMode.Restart) {
        this.lastPending.cancel();
      }
    }

    this.#performTask(task);
    return task;
  }

  async cancelAll(reason?: string): Promise<void> {
    await this.lastPending?.cancel(reason);
  }

  #performTask(task: Task<T>): void {
    task
      .perform()
      .then(
        () => {
          this.#reactiveState.lastFulfilled = task;
        },
        () => {
          if (task.isRejected) this.#reactiveState.lastRejected = task;
        }
      )
      .finally(() => {
        if (task.isFulfilled || task.isRejected) {
          this.#reactiveState.lastSettled = task;
        }

        if (this.#reactiveState.lastPending === task) {
          this.#reactiveState.lastPending = undefined;
          this.#reactiveState.status = JobStatus.Idle;
        }
      });

    this.#reactiveState.lastPending = task;
    this.#reactiveState.status = JobStatus.Pending;
  }
}

export function createJob<T, Args extends unknown[]>(
  taskFn: TaskFunction<T, Args>,
  options: JobOptions = {}
): Job<T, Args> {
  const job = new Job(taskFn, options);

  onCleanup(() => {
    job.cancelAll();
  });

  return job;
}
