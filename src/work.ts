import { cancellablePromise, timeoutPromise } from "./utils/promise";

export async function work<T>(
  signal: AbortSignal,
  promise: Promise<T>
): Promise<T> {
  return cancellablePromise(signal, promise);
}

export async function timeout(signal: AbortSignal, ms: number): Promise<void> {
  return work(signal, timeoutPromise(ms));
}
