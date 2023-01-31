import { createObject } from "solid-proxies";
import { work } from "./work";

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
  #eventTarget = new EventTarget();

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

  addEventListener(
    type: "abort" | "fulfill" | "reject",
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (typeof options === "boolean") {
      options = { capture: options };
    }

    this.#eventTarget.addEventListener(type, listener, {
      signal: type === "abort" ? undefined : this.signal,
      once: true,
      passive: true,
      ...options,
    });
  }

  removeEventListener(
    type: "abort" | "fulfill" | "reject",
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions
  ): void {
    this.#eventTarget.removeEventListener(type, listener, options);
  }

  #dispatchEvent(type: "abort" | "fulfill" | "reject"): void {
    this.#eventTarget.dispatchEvent(new Event(type));
  }

  async abort(cancelReason = "The task was aborted."): Promise<void> {
    if (!this.isIdle && !this.isPending) return;

    const error = new TaskAbortError(cancelReason);
    this.#abortController.abort(error);
    if (this.isIdle) this.#handleFailure(error);

    try {
      await this.#promise;
    } catch (error) {
      if (error instanceof TaskAbortError) return;
      throw error;
    }
  }

  perform(): Task<T> {
    this.#execute();
    return this;
  }

  #execute(): Promise<T> {
    this.#promise ??= this.#resolve();
    return this.#promise;
  }

  async #resolve(): Promise<T> {
    try {
      this.#abortController.signal.throwIfAborted();
      this.#reactiveState.status = TaskStatus.Pending;

      const value = await work(
        this.#abortController.signal,
        this.#promiseFn(this.#abortController.signal)
      );

      this.#handleSuccess(value);

      return value;
    } catch (error) {
      this.#handleFailure(error);
      throw error;
    }
  }

  #handleFailure(error: this["error"]): void {
    this.#reactiveState.error = error;

    if (error instanceof TaskAbortError) {
      this.#reactiveState.status = TaskStatus.Aborted;
      this.#dispatchEvent("abort");
    } else {
      this.#reactiveState.status = TaskStatus.Rejected;
      this.#dispatchEvent("reject");
    }
  }

  #handleSuccess(value: this["value"]): void {
    this.#reactiveState.value = value;
    this.#reactiveState.status = TaskStatus.Fulfilled;
    this.#dispatchEvent("fulfill");
  }
}

export function createTask<T>(
  promiseFn: (signal: AbortSignal) => Promise<T>
): Task<T> {
  return new Task(promiseFn);
}
