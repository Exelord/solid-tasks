import { createRoot, runWithOwner } from "solid-js";

export function isolate<T>(fn: () => T): T {
  let error;
  let hasErrored = false;
  const owner = null as any;

  const result = runWithOwner(owner, () => {
    return createRoot((dispose) => {
      try {
        return fn();
      } catch (e) {
        hasErrored = true;
        error = e;
        return;
      } finally {
        dispose();
      }
    });
  })!;

  if (hasErrored) throw error;

  return result;
}
