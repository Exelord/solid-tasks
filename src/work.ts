import { Task } from "./task";
import { cancellablePromise, timeoutPromise } from "./utils/promise";

export async function work<T, R>(
  task: Task<R>,
  promise: Promise<T>
): Promise<T> {
  return cancellablePromise(task.signal, promise);
}

export async function timeout<T>(task: Task<T>, ms: number): Promise<void> {
  return work(task, timeoutPromise(ms));
}
