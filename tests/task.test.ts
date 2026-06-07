import { createTask, TaskAbortError, TaskStatus } from "../src/task.ts";
import { describe, test, expect, vi } from "vite-plus/test";

describe("Task", () => {
  describe("#perform", async () => {
    test("fulfilled", async () => {
      const task = createTask(() => Promise.resolve("Hello World"));

      expect(task.status).toBe(TaskStatus.Idle);
      expect(task.isIdle).toBe(true);

      task.perform();

      expect(task.status).toBe(TaskStatus.Pending);
      expect(task.isPending).toBe(true);

      await task;

      expect(task.status).toBe(TaskStatus.Fulfilled);
      expect(task.isFulfilled).toBe(true);
      expect(task.isSettled).toBe(true);
      expect(task.value).toBe("Hello World");
    });

    test("rejected", async () => {
      const error = new Error("Something went wrong");
      const task = createTask(() => Promise.reject(error));

      expect(task.status).toBe(TaskStatus.Idle);
      expect(task.isIdle).toBe(true);

      task.perform();

      expect(task.status).toBe(TaskStatus.Pending);
      expect(task.isPending).toBe(true);

      await expect(task).rejects.toThrow("Something went wrong");

      expect(task.status).toBe(TaskStatus.Rejected);
      expect(task.isRejected).toBe(true);
      expect(task.isSettled).toBe(true);
      expect(task.error).toBe(error);
    });
  });

  describe("#abort", async () => {
    test("aborting pending task", async () => {
      const task = createTask(() => new Promise(() => {}));

      expect(task.status).toBe(TaskStatus.Idle);

      task.perform();

      expect(task.status).toBe(TaskStatus.Pending);

      await task.abort();

      expect(task.status).toBe(TaskStatus.Aborted);
      expect(task.error).toBeInstanceOf(TaskAbortError);
    });

    test("aborting idle task", async () => {
      const task = createTask(() => new Promise(() => {}));

      expect(task.status).toBe(TaskStatus.Idle);

      await task.abort();

      expect(task.status).toBe(TaskStatus.Aborted);

      await expect(task).rejects.toThrow("The task was aborted.");

      expect(task.status).toBe(TaskStatus.Aborted);
      expect(task.error).toBeInstanceOf(TaskAbortError);
    });

    test("uses the custom reason as the abort error message", async () => {
      const task = createTask(() => new Promise(() => {}));
      task.perform();

      await task.abort("No longer needed");

      expect(task.status).toBe(TaskStatus.Aborted);
      expect((task.error as Error).message).toBe("No longer needed");
    });

    test("ends as aborted (not rejected) when the body rejects with its own error", async () => {
      const task = createTask(
        (signal) =>
          new Promise((_, reject) => {
            // body responds to abort by rejecting with its OWN error
            signal.addEventListener("abort", () => reject(new Error("cleanup boom")));
          }),
      );
      task.perform();

      // abort() must resolve, not reject with the body's error.
      await expect(task.abort()).resolves.toBeUndefined();

      expect(task.status).toBe(TaskStatus.Aborted);
      expect(task.error).toBeInstanceOf(TaskAbortError);
      await expect(task).rejects.toBeInstanceOf(TaskAbortError);
    });

    test("keeps the fulfilled value when the body resolves before a late abort", async () => {
      let resolveBody!: (value: string) => void;
      const task = createTask(() => new Promise<string>((resolve) => (resolveBody = resolve)));
      task.perform();

      // Body resolves and abort is requested within the same tick. A produced
      // result wins: the completed work is delivered rather than discarded.
      resolveBody("done");
      await task.abort();

      expect(task.status).toBe(TaskStatus.Fulfilled);
      expect(task.value).toBe("done");
      await expect(task).resolves.toBe("done");
    });

    test("does not dispatch abort twice when an aborted idle task is awaited", async () => {
      const task = createTask(() => new Promise(() => {}));
      const listener = vi.fn();
      task.addEventListener("abort", listener);

      await task.abort();
      await expect(task).rejects.toThrow();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("#abortOnSignal", async () => {
    test("aborting pending task", async () => {
      const task = createTask(() => new Promise(() => {}));

      expect(task.status).toBe(TaskStatus.Idle);

      task.perform();

      expect(task.status).toBe(TaskStatus.Pending);

      const controller = new AbortController();
      task.abortOnSignal(controller.signal);

      controller.abort();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(task.status).toBe(TaskStatus.Aborted);
      expect(task.error).toBeInstanceOf(TaskAbortError);
    });

    test("aborting an idle task when the signal fires later", async () => {
      const task = createTask(() => new Promise(() => {}));

      const controller = new AbortController();
      task.abortOnSignal(controller.signal);

      expect(task.status).toBe(TaskStatus.Idle);

      controller.abort();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(task.status).toBe(TaskStatus.Aborted);
      expect(task.error).toBeInstanceOf(TaskAbortError);
    });

    test("returns the task for chaining", () => {
      const task = createTask(() => new Promise(() => {}));
      const controller = new AbortController();

      expect(task.abortOnSignal(controller.signal)).toBe(task);
    });

    test("does not register a listener when signal is already aborted", () => {
      const controller = new AbortController();
      controller.abort();

      const addSpy = vi.spyOn(controller.signal, "addEventListener");

      const task = createTask(() => new Promise(() => {}));
      task.abortOnSignal(controller.signal);

      expect(addSpy).not.toHaveBeenCalled();
    });

    test("aborts immediately when the signal is already aborted", () => {
      const controller = new AbortController();
      controller.abort();

      const task = createTask(() => new Promise(() => {}));
      task.abortOnSignal(controller.signal);

      expect(task.status).toBe(TaskStatus.Aborted);
      expect(task.error).toBeInstanceOf(TaskAbortError);
    });

    test("is a no-op when the task is already settled", async () => {
      const task = createTask(() => Promise.resolve("ok"));
      task.perform();
      await task;

      const controller = new AbortController();
      const addSpy = vi.spyOn(controller.signal, "addEventListener");

      expect(task.abortOnSignal(controller.signal)).toBe(task);
      expect(addSpy).not.toHaveBeenCalled();

      controller.abort();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(task.status).toBe(TaskStatus.Fulfilled);
      expect(task.value).toBe("ok");
    });

    test("stops reacting to the external signal after the task fulfills", async () => {
      const controller = new AbortController();
      const task = createTask(() => Promise.resolve("ok"));
      task.abortOnSignal(controller.signal);
      task.perform();

      await task;

      const abortSpy = vi.spyOn(task, "abort");
      controller.abort();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(abortSpy).not.toHaveBeenCalled();
      expect(task.status).toBe(TaskStatus.Fulfilled);
    });

    test("stops reacting to the external signal after the task rejects", async () => {
      const controller = new AbortController();
      const task = createTask(() => Promise.reject(new Error("boom")));
      task.abortOnSignal(controller.signal);
      task.perform();

      await expect(task).rejects.toThrow("boom");

      const abortSpy = vi.spyOn(task, "abort");
      controller.abort();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(abortSpy).not.toHaveBeenCalled();
      expect(task.status).toBe(TaskStatus.Rejected);
    });

    test("does not leak an unhandled rejection when the task fails as the signal aborts", async () => {
      // The body rejects with a NON-abort error in response to the abort. That
      // error wins the race inside `work`, so the task's internal promise
      // rejects with it (not a TaskAbortError). `abort()` rethrows non-abort
      // failures, so the fire-and-forget abort inside `abortOnSignal` would
      // surface an unhandled rejection unless it is swallowed.
      //
      // Note: if this regresses, the rejection escapes as a process-level
      // unhandled rejection, which Vitest reports as a suite error (non-zero
      // exit) even though the assertions below still pass. We also capture it
      // directly as a best-effort second guard.
      const rejections: unknown[] = [];
      const onRejection = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onRejection);

      try {
        const task = createTask(
          (signal) =>
            new Promise((_, reject) => {
              signal.addEventListener("abort", () => reject(new Error("cleanup failed")));
            }),
        );
        task.perform();

        const controller = new AbortController();
        task.abortOnSignal(controller.signal);
        controller.abort();

        await task.catch(() => {});
        for (let i = 0; i < 20 && rejections.length === 0; i++) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        expect(rejections).toEqual([]);

        // A failure that happens once abort was requested is treated as an
        // abort, regardless of what the body rejected with.
        expect(task.isAborted).toBe(true);
        expect(task.error).toBeInstanceOf(TaskAbortError);
      } finally {
        process.off("unhandledRejection", onRejection);
      }
    });

    test("stops reacting to the external signal after the task aborts via another path", async () => {
      const controller = new AbortController();
      const task = createTask(() => new Promise(() => {}));
      task.abortOnSignal(controller.signal);
      task.perform();

      await task.abort();

      const abortSpy = vi.spyOn(task, "abort");
      controller.abort();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(abortSpy).not.toHaveBeenCalled();
    });
  });

  describe("#addEventListener", async () => {
    test("replays the terminal event for listeners added after settle", async () => {
      const task = createTask(() => Promise.resolve("Hello World"));
      task.perform();
      await task;

      const fulfilled = vi.fn();
      const aborted = vi.fn();

      // Subscribed only after the task already fulfilled.
      task.addEventListener("fulfill", fulfilled);
      task.addEventListener("abort", aborted);

      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(fulfilled).toHaveBeenCalledTimes(1);
      expect(aborted).not.toHaveBeenCalled();
    });

    test("abort", async () => {
      const task = createTask(() => new Promise(() => {}));
      const listener = vi.fn();

      task.addEventListener("abort", listener);

      task.perform();

      await task.abort();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("fulfill", async () => {
      const task = createTask(() => Promise.resolve("Hello World"));
      const listener = vi.fn();

      task.addEventListener("fulfill", listener);

      task.perform();

      await task;

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("reject", async () => {
      const error = new Error("Something went wrong");
      const task = createTask(() => Promise.reject(error));
      const listener = vi.fn();

      task.addEventListener("reject", listener);

      task.perform();

      await expect(task).rejects.toThrow("Something went wrong");

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("#removeEventListener", async () => {
    test("does not throw when no listener was ever added", () => {
      const task = createTask(() => new Promise(() => {}));
      const listener = () => {};

      expect(() => task.removeEventListener("abort", listener)).not.toThrow();
    });

    test("abort", async () => {
      const task = createTask(() => new Promise(() => {}));
      const listener = vi.fn();

      task.addEventListener("abort", listener);
      task.removeEventListener("abort", listener);

      task.perform();

      await task.abort();

      expect(listener).not.toHaveBeenCalled();
    });

    test("fulfill", async () => {
      const task = createTask(() => Promise.resolve("Hello World"));
      const listener = vi.fn();

      task.addEventListener("fulfill", listener);
      task.removeEventListener("fulfill", listener);

      task.perform();

      await task;

      expect(listener).not.toHaveBeenCalled();
    });

    test("reject", async () => {
      const error = new Error("Something went wrong");
      const task = createTask(() => Promise.reject(error));
      const listener = vi.fn();

      task.addEventListener("reject", listener);
      task.removeEventListener("reject", listener);

      task.perform();

      await expect(task).rejects.toThrow("Something went wrong");

      expect(listener).not.toHaveBeenCalled();
    });
  });

  test("signal lets the task body clean up side effects on abort", async () => {
    const listener = vi.fn();
    const task = createTask(
      (signal) =>
        new Promise<void>((_, reject) => {
          const interval = setInterval(listener, 1);
          signal.addEventListener("abort", () => {
            clearInterval(interval);
            reject(signal.reason);
          });
        }),
    );

    task.perform();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(listener).toHaveBeenCalled();

    await task.abort();
    const callsAtAbort = listener.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(listener).toHaveBeenCalledTimes(callsAtAbort);
    expect(task.status).toBe(TaskStatus.Aborted);
    expect(task.error).toBeInstanceOf(TaskAbortError);
  });
});
