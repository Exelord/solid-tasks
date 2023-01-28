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
  lastAborted?: Task<T>;
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

  get lastAborted(): ReactiveState<T>["lastAborted"] {
    return this.#reactiveState.lastAborted;
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

    this.#instrumentTask(task);
    this.#reactiveState.performCount++;

    if (this.lastPending) {
      if (this.#options.mode === JobMode.Drop) {
        task.abort();
        return task;
      }

      if (this.#options.mode === JobMode.Restart) {
        this.lastPending.abort();
      }
    }

    task.perform();

    this.#reactiveState.lastPending = task;
    this.#reactiveState.status = JobStatus.Pending;

    return task;
  }

  async abort(reason?: string): Promise<void> {
    return this.lastPending?.abort(reason);
  }

  #instrumentTask(task: Task<T>): void {
    task.addEventListener("reject", () => {
      this.#reactiveState.lastRejected = task;
      this.#reactiveState.lastSettled = task;

      if (this.#reactiveState.lastPending === task) {
        this.#reactiveState.lastPending = undefined;
        this.#reactiveState.status = JobStatus.Idle;
      }
    });

    task.addEventListener("fulfill", () => {
      this.#reactiveState.lastFulfilled = task;
      this.#reactiveState.lastSettled = task;

      if (this.#reactiveState.lastPending === task) {
        this.#reactiveState.lastPending = undefined;
        this.#reactiveState.status = JobStatus.Idle;
      }
    });

    task.addEventListener("abort", () => {
      this.#reactiveState.lastAborted = task;

      if (this.#reactiveState.lastPending === task) {
        this.#reactiveState.lastPending = undefined;
        this.#reactiveState.status = JobStatus.Idle;
      }
    });
  }
}

export function createJob<T, Args extends unknown[]>(
  taskFn: TaskFunction<T, Args>,
  options: JobOptions = {}
): Job<T, Args> {
  const job = new Job(taskFn, options);

  onCleanup(() => {
    job.abort();
  });

  return job;
}
