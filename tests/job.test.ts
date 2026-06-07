import { work, timeout } from "../src/work.ts";
import { createJob, JobMode } from "../src/job.ts";
import { describe, test, expect } from "vite-plus/test";
import { createRoot, getOwner } from "solid-js";

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

      await job.lastPending;

      expect(job.isIdle).toBe(true);
      expect(task1.isFulfilled).toBe(true);
      expect(task2.isAborted).toBe(true);

      expect(job.lastFulfilled).toBe(task1);
      expect(job.lastSettled).toBe(task1);
      expect(job.lastAborted).toBe(task2);
      expect(job.lastRejected).toBe(undefined);
      expect(job.lastPending).toBe(undefined);
    });

    test("restart", async () => {
      const job = createJob(
        async (signal) => {
          await timeout(signal, 1);
          return "Hello World";
        },
        { mode: JobMode.Restart },
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
      expect(job.lastAborted).toBe(task1);
      expect(job.lastRejected).toBe(undefined);
      expect(job.lastPending).toBe(undefined);
    });
  });

  test("#abort", async () => {
    const job = createJob(async (signal) => {
      await work(signal, new Promise(() => {}));
    });

    expect(job.performCount).toBe(0);
    expect(job.isIdle).toBe(true);

    const task = job.perform();

    expect(job.performCount).toBe(1);
    expect(job.isPending).toBe(true);

    await job.abort();

    expect(job.isIdle).toBe(true);
    expect(task.isAborted).toBe(true);

    expect(job.lastAborted).toBe(task);
    expect(job.lastFulfilled).toBe(undefined);
    expect(job.lastSettled).toBe(undefined);
    expect(job.lastRejected).toBe(undefined);
    expect(job.lastPending).toBe(undefined);
  });

  test("aborts all tasks on cleanup", async () => {
    await createRoot(async (cleanup) => {
      const job = createJob(async (signal) => {
        await work(signal, new Promise(() => {}));
      });

      job.perform();

      expect(job.isPending).toBe(true);

      cleanup();

      await new Promise((resolve) => process.nextTick(resolve));

      expect(job.isPending).toBe(false);
    });
  });

  test("aborts nested tasks on signal", async () => {
    await createRoot(async () => {
      const job1 = createJob(async (signal) => {
        await work(signal, Promise.resolve());
        return "job1 done";
      });

      const job2 = createJob(async (signal) => {
        await work(signal, job1.perform().abortOnSignal(signal));
      });

      job2.perform();

      expect(job1.isPending).toBe(true);
      expect(job2.isPending).toBe(true);

      await job2.abort();

      expect(job2.isPending).toBe(false);
      expect(job1.isPending).toBe(false);
      expect(job1.lastFulfilled?.value).toBeUndefined();
    });
  });

  test("runs without owner", async () => {
    await createRoot(async () => {
      const job = createJob(async () => {
        expect(getOwner()).toBe(null);
      });

      expect(getOwner()).not.toBe(null);
      await job.perform();
    });
  });
});
