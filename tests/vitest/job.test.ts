import { work, timeout } from "../../src/work";
import { createJob, JobMode } from "../../src/job";
import { describe, test, expect } from "vitest";
import { createRoot } from "solid-js";

describe("job", () => {
  describe("#perform", () => {
    test("drop", async () => {
      const job = createJob(async (signal) => {
        await timeout(signal, 1);
        return "Hello World";
      });

      expect(job.performCount).toBe(0);
      expect(job.isIdle).toBe(true);

      const task1 = job.perform();

      expect(job.performCount).toBe(1);
      expect(job.isPending).toBe(true);
      expect(job.lastPending).toBe(task1);

      const task2 = job.perform();

      expect(job.performCount).toBe(2);
      expect(job.isPending).toBe(true);
      expect(job.lastPending).toBe(task1);

      await job.lastPending;

      expect(job.isIdle).toBe(true);
      expect(task1.isFulfilled).toBe(true);
      expect(task2.isAborted).toBe(true);

      expect(job.lastFulfilled).toBe(task1);
      expect(job.lastSettled).toBe(task1);
      expect(job.lastRejected).toBe(undefined);
      expect(job.lastPending).toBe(undefined);
    });

    test("restart", async () => {
      const job = createJob(
        async (signal) => {
          await timeout(signal, 1);
          return "Hello World";
        },
        { mode: JobMode.Restart }
      );

      expect(job.performCount).toBe(0);
      expect(job.isIdle).toBe(true);

      const task1 = job.perform();

      expect(job.performCount).toBe(1);
      expect(job.isPending).toBe(true);
      expect(job.lastPending).toBe(task1);

      const task2 = job.perform();

      expect(job.performCount).toBe(2);
      expect(job.isPending).toBe(true);
      expect(job.lastPending).toBe(task2);

      await job.lastPending;

      expect(job.isIdle).toBe(true);
      expect(task1.isAborted).toBe(true);
      expect(task2.isFulfilled).toBe(true);

      expect(job.performCount).toBe(2);
      expect(job.lastFulfilled).toBe(task2);
      expect(job.lastSettled).toBe(task2);
      expect(job.lastRejected).toBe(undefined);
      expect(job.lastPending).toBe(undefined);
    });
  });

  test("#cancelAll", async () => {
    const job = createJob(async (signal) => {
      await work(signal, new Promise(() => {}));
    });

    expect(job.performCount).toBe(0);
    expect(job.isIdle).toBe(true);

    const task = job.perform();

    expect(job.performCount).toBe(1);
    expect(job.isPending).toBe(true);

    await job.cancelAll();

    expect(job.isIdle).toBe(true);
    expect(task.isAborted).toBe(true);

    expect(job.lastFulfilled).toBe(undefined);
    expect(job.lastSettled).toBe(undefined);
    expect(job.lastRejected).toBe(undefined);
    expect(job.lastPending).toBe(undefined);
  });

  test("cancels all tasks on cleanup", async () => {
    await createRoot(async (cleanup) => {
      const job = createJob(async (signal) => {
        await work(signal, new Promise(() => {}));
      });

      job.perform();

      expect(job.isPending).toBe(true);

      cleanup();

      await new Promise(process.nextTick);

      expect(job.isPending).toBe(false);
    });
  });
});
