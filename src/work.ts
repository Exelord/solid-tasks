import { TaskContext } from "./task";
import { signalledPromise, timeoutPromise } from "./utils/promise";

export async function work<T>(context: TaskContext, promise: Promise<T>) {
  return signalledPromise(context.signal, promise);
}

export async function timeout(context: TaskContext, ms: number) {
  return work(context, timeoutPromise(ms));
}
