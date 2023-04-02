import { runWithOwner } from "solid-js";

export function isolate<T>(fn: () => T): T {
  let error: unknown;
  let hasError = false;

  const result = runWithOwner(null, () => {
    try {
      return fn();
    } catch (e) {
      hasError = true;
      error = e;
      throw e;
    }
  })!;

  if (hasError) {
    throw error;
  }

  return result;
}
