import {
  createTask,
  TaskCancelledError,
  TaskDroppedError,
  TaskStatus,
} from "../../src/task";
import { describe, test, expect } from "vitest";

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

  describe("#cancel", async () => {
    test("cancelling pending task", async () => {
      const task = createTask(() => new Promise(() => {}));

      expect(task.status).toBe(TaskStatus.Idle);

      task.perform();

      expect(task.status).toBe(TaskStatus.Pending);

      await task.cancel();

      expect(task.status).toBe(TaskStatus.Canceled);
      expect(task.error).toBeInstanceOf(TaskCancelledError);
    });

    test("cancelling idle task", async () => {
      const task = createTask(() => new Promise(() => {}));

      expect(task.status).toBe(TaskStatus.Idle);

      await task.cancel();

      expect(task.status).toBe(TaskStatus.Dropped);

      await expect(task).rejects.toThrow("Task has been cancelled.");

      expect(task.status).toBe(TaskStatus.Dropped);
      expect(task.error).toBeInstanceOf(TaskDroppedError);
    });
  });
});
