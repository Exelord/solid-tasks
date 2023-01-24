import { createObject } from "solid-proxies";
import { cancellablePromise } from "./utils/promise";

export enum TaskStatus {
  Idle = "idle",
  Pending = "pending",
  Fulfilled = "fulfilled",
  Rejected = "rejected",
  Aborted = "aborted",
}

export class TaskAbortError extends Error {
  name = "TaskAbortError";
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

  get isSettled(): boolean {
    return [TaskStatus.Fulfilled, TaskStatus.Rejected].includes(this.status);
  }

  get isAborted(): boolean {
    return this.status === TaskStatus.Aborted;
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
    return this.#execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null
      | undefined
  ): Promise<T | TResult> {
    return this.#execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this.#execute().finally(onfinally);
  }

  perform(): Task<T> {
    this.#execute();
    return this;
  }

  async abort(cancelReason = "The task was aborted."): Promise<void> {
    if (!this.isIdle && !this.isPending) return;

    const error = new TaskAbortError(cancelReason);

    this.#handleFailure(error);
    this.#abortController.abort(error);

    // We want to make sure that the promise has been rejected if pending.
    try {
      await this.#promise;
    } catch {
      return;
    }
  }

  #execute(): Promise<T> {
    this.#promise ??= this.#resolve();
    return this.#promise;
  }

  async #resolve(): Promise<T> {
    // We need to check if the task has been cancelled before we start the promise.
    this.#abortController.signal.throwIfAborted();

    this.#reactiveState.status = TaskStatus.Pending;

    return cancellablePromise(
      this.#abortController.signal,
      this.#promiseFn(this.#abortController.signal).then(
        (value) => {
          if (this.isPending) this.#handleSuccess(value);
          return value;
        },
        (error) => {
          if (this.isPending) this.#handleFailure(error);
          throw error;
        }
      )
    );
  }

  #handleFailure(error: this["error"]): void {
    if (error instanceof TaskAbortError) {
      this.#reactiveState.status = TaskStatus.Aborted;
    } else {
      this.#reactiveState.status = TaskStatus.Rejected;
    }

    this.#reactiveState.error = error;
  }

  #handleSuccess(value: this["value"]): void {
    this.#reactiveState.status = TaskStatus.Fulfilled;
    this.#reactiveState.value = value;
  }
}

export function createTask<T>(
  promiseFn: (signal: AbortSignal) => Promise<T>
): Task<T> {
  return new Task(promiseFn);
}
