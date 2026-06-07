import { work, timeout } from "../src/work.ts";
import { describe, test, expect, vi } from "vite-plus/test";

describe("work", () => {
  test("resolves with the promise value", async () => {
    const controller = new AbortController();

    await expect(work(controller.signal, Promise.resolve("Hello World"))).resolves.toBe(
      "Hello World",
    );
  });

  test("rejects with the promise error", async () => {
    const controller = new AbortController();
    const error = new Error("Something went wrong");

    await expect(work(controller.signal, Promise.reject(error))).rejects.toBe(error);
  });

  test("rejects with the signal reason when aborted mid-flight", async () => {
    const controller = new AbortController();
    const reason = new Error("aborted mid-flight");

    const promise = work(controller.signal, new Promise(() => {}));
    controller.abort(reason);

    await expect(promise).rejects.toBe(reason);
  });

  test("throws immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("already aborted");
    controller.abort(reason);

    await expect(work(controller.signal, Promise.resolve("ignored"))).rejects.toBe(reason);
  });

  test("removes its abort listener after the promise settles", async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    await work(controller.signal, Promise.resolve("done"));

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  test("does not leak an unhandled rejection when the promise wins the race", async () => {
    // The `finally` block calls reject() on the internal signal promise after
    // the main promise already won. Because Promise.race keeps a reaction
    // attached to that promise, the rejection is handled — no unhandled
    // rejection should ever surface.
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    try {
      const controller = new AbortController();

      for (let i = 0; i < 50; i++) {
        await expect(work(controller.signal, Promise.resolve(i))).resolves.toBe(i);
      }

      // Give the event loop time to flag any still-unhandled rejection.
      for (let i = 0; i < 10 && rejections.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  test("removes its abort listener after the promise rejects", async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    await expect(work(controller.signal, Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

describe("timeout", () => {
  test("resolves after the given delay", async () => {
    const controller = new AbortController();

    await expect(timeout(controller.signal, 1)).resolves.toBeUndefined();
  });

  test("rejects with the signal reason when aborted before elapsing", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled timeout");

    const promise = timeout(controller.signal, 1000);
    controller.abort(reason);

    await expect(promise).rejects.toBe(reason);
  });

  test("throws immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(timeout(controller.signal, 1000)).rejects.toThrow();
  });

  test("clears its pending timer when aborted", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const promise = timeout(controller.signal, 60_000).catch(() => {});

      controller.abort();
      await promise;

      // The 60s timer must be cleared, not left pending to hold the event loop.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
