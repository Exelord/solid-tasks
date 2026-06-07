import { runWithOwner, untrack } from "solid-js";
import { createObject } from "solid-proxies";
import { work } from "./work.ts";

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
    return this.isFulfilled || this.isRejected;
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
  #eventTarget?: EventTarget;
  #dispatched = false;
  #settledController?: AbortController;

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

  // Task is intentionally thenable: it implements the Promise interface.
  // oxlint-disable-next-line no-thenable
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.#execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.#execute().finally(onfinally);
  }

  addEventListener(
    type: "abort" | "fulfill" | "reject",
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (typeof options === "boolean") {
      options = { capture: options };
    }

    // The task is one-shot: once it has dispatched its terminal event, replay
    // that event for late subscribers (promise-like), and ignore listeners for
    // events that can no longer happen.
    if (this.#dispatched) {
      if (this.#terminalEvent() === type) {
        queueMicrotask(() => listener(new Event(type)));
      }
      return;
    }

    this.#eventTarget ??= new EventTarget();

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
    options?: boolean | EventListenerOptions,
  ): void {
    this.#eventTarget?.removeEventListener(type, listener, options);
  }

  // Dispatches the task's single terminal event (derived from `status`) once.
  #dispatch(): void {
    if (this.#dispatched) return;
    this.#dispatched = true;

    const type = this.#terminalEvent();
    if (type) this.#eventTarget?.dispatchEvent(new Event(type));

    // Release any external `abortOnSignal` listeners now that the task settled.
    this.#settledController?.abort();
  }

  #terminalEvent(): "abort" | "fulfill" | "reject" | undefined {
    switch (this.status) {
      case TaskStatus.Fulfilled:
        return "fulfill";
      case TaskStatus.Rejected:
        return "reject";
      case TaskStatus.Aborted:
        return "abort";
      default:
        return undefined;
    }
  }

  /**
   * Aborts the task.
   */
  abort(cancelReason = "The task was aborted."): Promise<void> {
    return untrack(async () => {
      if (!this.isIdle && !this.isPending) return;

      this.#abortController.abort(new TaskAbortError(cancelReason));
      if (this.isIdle) this.#handleFailure(this.signal.reason);

      // Wait for the task to settle. Once aborted, any rejection is the abort
      // itself, so it is safe to swallow — `abort()` resolves, never throws.
      await this.#promise?.catch(() => {});
    });
  }

  /**
   * Aborts task when the given signal is aborted.
   */
  abortOnSignal(signal: AbortSignal): Task<T> {
    if (this.isSettled || this.isAborted) return this;

    // Fire-and-forget: swallow any rejection from abort() so it can never
    // surface as an unhandled rejection. The failure, if any, is already
    // recorded on the task and observable by anyone awaiting it.
    const abort = () => void this.abort().catch(() => {});

    if (signal.aborted) {
      abort();
      return this;
    }

    // The listener is removed automatically once the task settles (see
    // `#dispatch`), so a long-lived external signal never retains a stale
    // handler — and the task along with it.
    this.#settledController ??= new AbortController();
    signal.addEventListener("abort", abort, {
      once: true,
      signal: this.#settledController.signal,
    });

    return this;
  }

  /**
   * Performs the task.
   */
  perform(): Task<T> {
    void this.#execute();
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
        this.#promiseFn(this.#abortController.signal),
      );

      this.#handleSuccess(value);

      return value;
    } catch (error) {
      this.#handleFailure(error);
      // Once aborted, surface the abort reason so awaiters (and `abort()`) see
      // a TaskAbortError consistent with the task's status, regardless of what
      // the task body actually threw.
      throw this.signal.aborted ? this.signal.reason : error;
    }
  }

  #handleFailure(error: this["error"]): void {
    // A failure that happens once abort was requested is an abort, regardless
    // of what the task body threw or rejected with.
    if (this.signal.aborted) {
      this.#reactiveState.error = this.signal.reason;
      this.#reactiveState.status = TaskStatus.Aborted;
    } else {
      this.#reactiveState.error = error;
      this.#reactiveState.status = TaskStatus.Rejected;
    }

    this.#dispatch();
  }

  #handleSuccess(value: this["value"]): void {
    this.#reactiveState.value = value;
    this.#reactiveState.status = TaskStatus.Fulfilled;
    this.#dispatch();
  }
}

export function createTask<T>(promiseFn: (signal: AbortSignal) => Promise<T>): Task<T> {
  return new Task(promiseFn);
}
