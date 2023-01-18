import { createObject } from "solid-proxies";

// export type TaskFunction<T, Args extends any[]> = (...args: Args) => Promise<T>;

export enum TaskStatus {
  Idle = "idle",
  Pending = "pending",
  Fulfilled = "fulfilled",
  Rejected = "rejected",
  Canceled = "canceled",
  Dropped = "dropped",
}

export class TaskError extends Error {
  name = "TaskError";
}

export class TaskCancelledError extends TaskError {
  name = "TaskCancelledError";
}

export class TaskDroppedError extends TaskError {
  name = "TaskDroppedError";
}

export class Task<T> implements Promise<T> {
  get value(): T | null | undefined {
    return this.#reactiveState.value;
  }

  get error(): unknown {
    return this.#reactiveState.error;
  }

  get isIdle(): boolean {
    return this.status === TaskStatus.Idle;
  }

  get isPending(): boolean {
    return this.status === TaskStatus.Pending;
  }

  get isFulfilled(): boolean {
    return this.status === TaskStatus.Fulfilled;
  }

  get isRejected(): boolean {
    return this.status === TaskStatus.Rejected;
  }

  get isCancelled(): boolean {
    return this.status === TaskStatus.Canceled;
  }

  get isDropped(): boolean {
    return this.status === TaskStatus.Dropped;
  }

  get isSettled(): boolean {
    return [TaskStatus.Fulfilled, TaskStatus.Rejected].includes(this.status);
  }

  get status(): TaskStatus {
    return this.#reactiveState.status;
  }

  get [Symbol.toStringTag](): string {
    return "Task";
  }

  #promise?: Promise<T>;
  #promiseFn: (signal: AbortSignal) => Promise<T>;
  #abortController = new AbortController();

  #reactiveState = createObject<{
    value?: T | null;
    error?: unknown;
    status: TaskStatus;
  }>({
    value: null,
    status: TaskStatus.Idle,
  });

  constructor(promiseFn: (signal: AbortSignal) => Promise<T>) {
    this.#promiseFn = promiseFn;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null
      | undefined
  ): Promise<T | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this.execute().finally(onfinally);
  }

  async execute(): Promise<T> {
    this.#promise ??= this.#resolve();
    return this.#promise;
  }

  async cancel(cancelReason = "Task has been cancelled."): Promise<void> {
    if (this.isIdle) {
      const error = new TaskDroppedError(cancelReason);
      this.#abortController.abort(error);
      this.#reactiveState.error = error;
      this.#reactiveState.status = TaskStatus.Dropped;
    } else if (this.isPending) {
      const error = new TaskCancelledError(cancelReason);
      this.#abortController.abort(error);
      this.#reactiveState.error = error;
      this.#reactiveState.status = TaskStatus.Canceled;
    }

    // We don't want to throw any error as cancellation has been successful.
    try {
      await this.#promise;
    } catch (error) {
      return;
    }
  }

  async #resolve(): Promise<T> {
    // We need to check if the task has been cancelled before we start the promise.
    this.#abortController.signal.throwIfAborted();

    const promise = this.#promiseFn(this.#abortController.signal);
    this.#reactiveState.status = TaskStatus.Pending;

    // We race to make sure we don't wait for the promise to resolve if it has been cancelled.
    const value = await Promise.race([
      promise.catch((error) => {
        if (this.isPending) {
          this.#reactiveState.error = error;
          this.#reactiveState.status = TaskStatus.Rejected;
        }
        throw error;
      }),

      // We need to create a promise that we can reject when the task is cancelled.
      new Promise<never>((_resolve, reject) => {
        // We listen for the abort event so we can reject the promise.
        this.#abortController.signal.addEventListener("abort", () => {
          reject(this.#abortController.signal.reason);
        });
      }),
    ]);

    this.#reactiveState.value = value;
    this.#reactiveState.status = TaskStatus.Fulfilled;

    return value;
  }
}

export function createTask<T>(promiseFn: () => Promise<T>): Task<T> {
  return new Task(promiseFn);
}
