import { createTask, TaskAbortError, TaskStatus } from "../../src/task";
import { describe, test, expect, vi } from "vitest";

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
  });

  describe("#addEventListener", async () => {
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
});
