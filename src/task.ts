import { runWithOwner, untrack } from "solid-js";
import { createObject } from "solid-proxies";
import { work } from "./work";

export enum TaskStatus {
  Idle = "idle",
  Pending = "pending",
  Fulfilled = "fulfilled",
  Rejected = "rejected",
  Aborted = "aborted",
}

/**
 * An error that is thrown when a task is aborted.
 */
export class TaskAbortError extends Error {
  name = "TaskAbortError";
}

/**
 * A task is a promise that can be aborted, aware of its state.
 */
export class Task<T> implements Promise<T> {
  /**
   * The current value of the task.
   */
  get value(): T | null | undefined {
    return this.#reactiveState.value;
  }

  /** 
   * The current error of the task.
   */
  get error(): unknown {
    return this.#reactiveState.error;
  }

  /** 
   * Whether the task is currently idle.
   */
  get isIdle(): boolean {
    return this.status === TaskStatus.Idle;
  }

  /** 
   * Whether the task is currently pending.
   */
  get isPending(): boolean {
    return this.status === TaskStatus.Pending;
  }

  /** 
   * Whether the task is currently fulfilled.
   */
  get isFulfilled(): boolean {
    return this.status === TaskStatus.Fulfilled;
  }

  /** 
   * Whether the task is currently rejected.
   */
  get isRejected(): boolean {
    return this.status === TaskStatus.Rejected;
  }

  /** 
   * Whether the task is currently settled.
   */
  get isSettled(): boolean {
    return [TaskStatus.Fulfilled, TaskStatus.Rejected].includes(this.status);
  }

  /** 
   * Whether the task is currently aborted.
   */
  get isAborted(): boolean {
    return this.status === TaskStatus.Aborted;
  }

  /** 
   * The current status of the task.
   */
  get status(): TaskStatus {
    return this.#reactiveState.status;
  }

  /** 
   * The signal of the task. Used to abort the task.
   */
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
    this.#promiseFn = (signal) => runWithOwner(null, () => promiseFn(signal))!;
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

  /**
   * Aborts the task.
   */
  abort(cancelReason = "The task was aborted."): Promise<void> {
    return untrack(async () => {
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
    });
  }

  /**
   * Performs the task.
   */
  perform(): Task<T> {
    this.#execute();
    return this;
  }

  #execute(): Promise<T> {
    this.#promise ??= untrack(() => this.#resolve());
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
