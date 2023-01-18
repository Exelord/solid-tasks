import { createObject } from "solid-proxies";
import { cancellablePromise } from "./utils/promise";

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

  get signal(): AbortSignal {
    return this.#abortController.signal;
  }

  get [Symbol.toStringTag](): string {
    return "Task";
  }

  #promise?: Promise<T>;
  #promiseFn: (task: Task<T>) => Promise<T>;
  #abortController = new AbortController();

  #reactiveState = createObject<{
    value?: T | null;
    error?: unknown;
    status: TaskStatus;
  }>({
    value: null,
    status: TaskStatus.Idle,
  });

  constructor(promiseFn: (task: Task<T>) => Promise<T>) {
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
      this.#handleFailure(TaskStatus.Dropped, error);
    } else if (this.isPending) {
      const error = new TaskCancelledError(cancelReason);
      this.#abortController.abort(error);
      this.#handleFailure(TaskStatus.Canceled, error);
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

    this.#reactiveState.status = TaskStatus.Pending;

    const promise = this.#promiseFn(this).catch((error) => {
      if (this.isPending) {
        this.#handleFailure(TaskStatus.Rejected, error);
      }
      throw error;
    });

    const value = await cancellablePromise(
      this.#abortController.signal,
      promise
    );

    this.#handleSuccess(TaskStatus.Fulfilled, value);

    return value;
  }

  #handleFailure(status: TaskStatus, error: this["error"]): void {
    this.#reactiveState.status = status;
    this.#reactiveState.error = error;
  }

  #handleSuccess(status: TaskStatus, value: this["value"]): void {
    this.#reactiveState.status = status;
    this.#reactiveState.value = value;
  }
}

export function createTask<T>(
  promiseFn: (task: Task<T>) => Promise<T>
): Task<T> {
  return new Task(promiseFn);
}
