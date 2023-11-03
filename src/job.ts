import { getOwner, onCleanup, untrack } from "solid-js";
import { createObject } from "solid-proxies";
import { createTask, Task } from "./task";

export type TaskFunction<T, Args extends unknown[]> = (
  signal: AbortSignal,
  ...args: Args
) => Promise<T>;

export enum JobStatus {
  Idle = "idle",
  Pending = "pending",
}

export type JobMode = (typeof JobMode)[keyof typeof JobMode];

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

export const JobMode = {
  Drop: "drop",
  Restart: "restart",
} as const;

/**
 * A Job is a wrapper around a task function that provides
 * a reactive interface to the task's state.
 * @template T The return type of the task function.
 * @template Args The argument types of the task function.
 * @param taskFn The task function to wrap.
 * @param options Options for the job.
 * @returns A job instance.
 * @example
 * ```ts
 * const job = createJob(async (signal, url: string) => {
 *   const response = await fetch(url, { signal });
 *   return response.json();
 * });
 *
 * const task = job.perform("https://example.test");
 *
 * console.log(job.status); // "pending"
 * console.log(job.isPending); // true
 * console.log(job.isIdle); // false
 *
 * await task;
 *
 * console.log(job.status); // "idle"
 * console.log(job.isPending); // false
 * console.log(job.isIdle); // true
 * ```
 */
export class Job<T, Args extends unknown[]> {
  /**
   * The current status of the job.
   */
  get status(): ReactiveState<T>["status"] {
    return this.#reactiveState.status;
  }

  /**
   * Whether the job is currently idle. Not performing a task.
   */
  get isIdle(): boolean {
    return this.status === JobStatus.Idle;
  }

  /**
   * Whether the job is currently pending. Performing a task.
   */
  get isPending(): boolean {
    return this.status === JobStatus.Pending;
  }

  /**
   * Last pending task.
   */
  get lastPending(): ReactiveState<T>["lastPending"] {
    return this.#reactiveState.lastPending;
  }

  /**
   * Last fulfilled task.
   */
  get lastFulfilled(): ReactiveState<T>["lastFulfilled"] {
    return this.#reactiveState.lastFulfilled;
  }

  /**
   * Last rejected task.
   */
  get lastRejected(): ReactiveState<T>["lastRejected"] {
    return this.#reactiveState.lastRejected;
  }

  /**
   * Last settled task.
   */
  get lastSettled(): ReactiveState<T>["lastSettled"] {
    return this.#reactiveState.lastSettled;
  }

  /**
   * Last aborted task.
   */
  get lastAborted(): ReactiveState<T>["lastAborted"] {
    return this.#reactiveState.lastAborted;
  }

  /**
   * Number of times the job has performed a task, fulfilled or not.
   */
  get performCount(): ReactiveState<T>["performCount"] {
    return this.#reactiveState.performCount;
  }

  #taskFn: TaskFunction<T, Args>;
  #options: JobOptions;

  #reactiveState: ReactiveState<T> = createObject({
    status: JobStatus.Idle,
    performCount: 0,
  });

  constructor(taskFn: TaskFunction<T, Args>, { mode }: JobOptions = {}) {
    this.#taskFn = taskFn;
    this.#options = { mode: mode ?? JobMode.Drop };
  }

  /**
   * Perform a task.
   * @param args Arguments to pass to the task function.
   * @returns A task instance.
   */
  perform(...args: Args): Task<T> {
    return untrack(() => {
      const task = createTask((signal) => this.#taskFn(signal, ...args));
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
    });
  }

  /**
   * Abort the last pending task.
   * @param reason A reason for aborting the task.
   * @returns A promise that resolves when the task is aborted.
   */
  async abort(reason?: string): Promise<void> {
    return untrack(() => this.lastPending?.abort(reason));
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

/**
 * Create a job.
 * @template T The return type of the task function.
 * @template Args The argument types of the task function.
 * @param taskFn The task function to wrap.
 * @param options Options for the job.
 * @returns A job instance.
 */
export function createJob<T, Args extends unknown[]>(
  taskFn: TaskFunction<T, Args>,
  options: JobOptions = {}
): Job<T, Args> {
  const job = new Job(taskFn, options);

  if (getOwner()) {
    onCleanup(() => {
      job.abort();
    });
  }

  return job;
}
