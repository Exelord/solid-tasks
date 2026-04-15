<p align="center">
  <img height="400" src="https://raw.githubusercontent.com/exelord/solid-tasks/main/logo.png" alt="Solid Tasks logo" />
</p>

# Solid Tasks

A small but powerful async state-management library for Solid.js that models asynchronous work as explicit, abortable, stateful objects. Instead of wiring UI directly to raw promises, Solid Tasks introduces two core primitives `Task` and `Job` so developers can reason about loading, cancellation, concurrency, retries, and event-driven workflows in a disciplined way.

This library is especially useful in real user interfaces where the same action may be triggered repeatedly, interrupted, superseded, or abandoned. Those situations are not edge cases; they are the normal behavior of interactive systems. Solid Tasks gives them a first-class model.

---

## Table of contents

- [Scope and abstraction level](#scope-and-abstraction-level)
- [Why this library exists](#why-this-library-exists)
- [What problem it solves](#what-problem-it-solves)
- [Core mental model](#core-mental-model)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Public API](#public-api)
- [Task deep dive](#task-deep-dive)
- [Job deep dive](#job-deep-dive)
- [Why UI events should be Jobs](#why-ui-events-should-be-jobs)
- [Data loading](#data-loading)
- [Mutation workflows](#mutation-workflows)
- [Concurrency patterns](#concurrency-patterns)
- [Abort handling](#abort-handling)
- [Real-world examples](#real-world-examples)
- [Design guidelines](#design-guidelines)
- [When to use Tasks directly](#when-to-use-tasks-directly)
- [When to use Jobs](#when-to-use-jobs)
- [Testing strategy](#testing-strategy)
- [API reference](#api-reference)

---

## Scope and abstraction level

**It is crucial to understand that Solid Tasks is a low-level primitive, not a high-level framework.** 

This library is designed to deal strictly with the **state machine and UI flow of Promises** (loading flags, cancellation, fulfillment, rejection) and localized concurrency (dropping or restarting overlapping requests). 

While it *can* be used directly in your application code, **it is not a replacement for high-level data fetching libraries like TanStack Query or Solid's native `createResource`.** 

If you attempt to use Solid Tasks as your primary global data-fetching and caching layer, you will find that it is not optimized for that Developer Experience (DX) and will require significant boilerplate. It does not handle global cache invalidation, background refetching, or pagination out of the box.

Instead, Solid Tasks is the kind of primitive you use to **build** more complex solutions. It shines when used as:
- The underlying engine for advanced, bespoke event-handling pipelines.
- A building block for custom data-loading wrappers.
- A tool to manage complex, multi-step UI mutations (like chained save/upload operations) where you need fine-grained control over cancellation and race conditions.

Think of it as the missing standard library for Promise state in Solid.js, providing the raw materials for you to construct higher-order architectures.

---

## Why this library exists

Frontend applications are full of asynchronous work:

- loading data
- saving forms
- searching while typing
- retrying failed operations
- cancelling stale requests
- preventing duplicate submits
- coordinating work with component lifetime

JavaScript promises are a good low-level primitive for async programming, but they are not a complete UI state model.

A native `Promise` can be awaited, chained, fulfilled, or rejected, but it does **not** by itself expose a reactive UI-friendly interface such as:

- “is this operation pending right now?”
- “what was the last successful value?”
- “what was the last error?”
- “was this failure actually a cancellation?”
- “what should happen if the user triggers this action twice?”

To build these behaviors with bare promises, developers typically add extra signals, local booleans, guards, abort controllers, event listeners, and cleanup logic. The result often works, but the logic becomes fragmented and repetitive.

Solid Tasks turns asynchronous work into explicit stateful objects so that UI logic and concurrency logic stay in one place.

---

## What problem it solves

Solid Tasks solves four recurring problems in UI architecture.

### 1. Async state is usually scattered

Without a dedicated abstraction, a simple async operation often requires several separate pieces of state:

- `isLoading`
- `error`
- `data`
- `controller`
- cleanup logic
- duplicate-click protection

That is manageable once, but costly when repeated across a codebase.

### 2. Cancellation is often bolted on too late

Many async handlers are written first and only later retrofitted with cancellation after race conditions appear. By then, cancellation is already spread across event handlers and component lifecycle code.

### 3. Concurrency policies are usually implicit

If a user clicks a button twice, what should happen?

- ignore the second click?
- cancel the first request and keep the second?
- allow both?
- queue them?

Most apps need a clear answer, but raw async handlers rarely encode that answer explicitly.

### 4. Component lifetime and async lifetime drift apart

An async operation can outlive the component that started it. If it completes after unmount, it may attempt to update state that no longer matters or no longer exists.

Solid Tasks addresses these by making async work:

- explicit
- abortable
- stateful
- concurrency-aware
- owner-aware in Solid

---

## Core mental model

The library revolves around two concepts:

### `Task`

A `Task<T>` represents **one concrete execution** of asynchronous work.

Think of it as a promise plus:

- lifecycle state
- abort support
- reactive flags
- value/error storage
- lifecycle events

A `Task` answers:  
**“What is happening in this specific run?”**

### `Job`

A `Job<T, Args>` represents a **repeatable async operation** that can be performed many times.

It manages `Task` instances and applies a concurrency strategy when new executions happen while another one is already pending.

A `Job` answers:  
**“What is the policy for this operation over time?”**

This distinction matters:

- A **Task** is one attempt.
- A **Job** is the reusable operation that creates attempts.

If a `Task` is like one train journey, a `Job` is the train line and its scheduling policy.

---

## Installation

```bash
npm install solid-tasks
```

---

## Quick start

### A simple save action

```tsx
import { createJob, timeout } from "solid-tasks";

const saveJob = createJob(async (signal) => {
  await timeout(signal, 1000);
  await fetch("/api/save", {
    method: "POST",
    signal,
  });
});
```

```tsx
<button type="button" onClick={() => saveJob.perform()}>
  {saveJob.isPending ? "Saving..." : "Save"}
</button>
```

What this gives you immediately:

- a reactive pending flag
- automatic cancellation support
- one place to reason about the save operation
- protection against overlapping actions according to the selected job mode

---

## Public API

```ts
import {
  createTask,
  TaskStatus,
  TaskAbortError,
  createJob,
  JobMode,
  work,
  timeout,
} from "solid-tasks";
```

---

## Task deep dive

## What a Task is

A `Task<T>` wraps one async function of the form:

```ts
(signal: AbortSignal) => Promise<T>
```

The task owns an `AbortController` and exposes the corresponding signal to the function. That means your async code can participate in cancellation naturally.

Example:

```ts
import { createTask } from "solid-tasks";

const userTask = createTask(async (signal) => {
  const response = await fetch("/api/user", { signal });
  return response.json();
});
```

At this point, the task exists, but the operation has not necessarily started yet. The task becomes useful because it is not just a promise; it is an object with lifecycle and control.

### Why a Task is better than a bare promise

A bare promise tells you the final result eventually. A task tells you:

- whether it has started
- whether it is still pending
- whether it fulfilled
- whether it rejected
- whether it was aborted
- what the value is
- what the error is

That makes a task suitable for UI state and orchestration logic.

### Task lifecycle

A task moves through a small state machine:

1. `idle`
2. `pending`
3. `fulfilled` or `rejected` or `aborted`

This explicit lifecycle is one of the most important design decisions in the library. The goal is not merely to run async code but to model it.

### Task status flags

Tasks expose convenient boolean flags:

- `isIdle`
- `isPending`
- `isFulfilled`
- `isRejected`
- `isSettled`
- `isAborted`

This matters because UI conditions read more naturally as:

```tsx
<Show when={task.isPending}>Loading...</Show>
```

than as custom hand-maintained state.

### Task value and error

A task stores its latest result metadata on the object itself:

- `task.value`
- `task.error`

This gives the async operation memory. Instead of keeping result state in one signal and error state in another, the task encapsulates both.

### Task as a promise-like object

Tasks are promise-like and support:

- `then`
- `catch`
- `finally`

So they integrate naturally with existing async code:

```ts
task.perform().then((value) => {
  console.log(value);
});
```

That means the abstraction is additive rather than alien. You still get promise ergonomics, but with a richer lifecycle model.

### Task cancellation

A task can be aborted explicitly:

```ts
task.abort();
```

Or with a custom reason:

```ts
task.abort("No longer needed");
```

Cancellation is not treated as a mysterious side effect. It is a first-class state transition.

This is academically important because cancellation is not merely “failure.” It is a different category of outcome. A cancelled request does not necessarily mean the system malfunctioned; it may mean the system behaved correctly by discarding obsolete work.

### Task events

Tasks also support lifecycle events:

- `"abort"`
- `"fulfill"`
- `"reject"`

That allows code to react to lifecycle transitions without tightly coupling everything to awaiting the result.

Example:

```ts
task.addEventListener("fulfill", () => {
  console.log("Task completed successfully");
});
```

This event model is especially useful when jobs coordinate task histories.

---

## Job deep dive

## What a Job is

A `Job<T, Args>` wraps a repeatable async function:

```ts
(signal: AbortSignal, ...args: Args) => Promise<T>
```

Each call to `job.perform(...args)` creates a new `Task`.

So a job does not directly represent “one request.”  
It represents a reusable async operation with policy.

Example:

```ts
import { createJob, JobMode } from "solid-tasks";

const searchJob = createJob(
  async (signal, query: string) => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal,
    });
    return response.json();
  },
  { mode: JobMode.Restart }
);
```

### Why Jobs matter

Most UI operations are not one-off async calls. They are repeated behaviors:

- save this form
- search using this text
- load this detail view
- refresh this dashboard
- submit this payment
- send this email

When an operation can be triggered more than once, you need a policy. That is exactly what a job encodes.

### Job state

A job tracks more than just “is it loading?”

It exposes:

- `status`
- `isIdle`
- `isPending`
- `performCount`
- `lastPending`
- `lastFulfilled`
- `lastRejected`
- `lastSettled`
- `lastAborted`

This historical memory is extremely valuable in real interfaces.

For example:

- `lastFulfilled` lets you keep rendering the last good data while a refresh is pending.
- `lastRejected` lets you show the latest failure.
- `lastAborted` helps distinguish obsolete work from real failure.
- `performCount` is useful for analytics, debugging, and retry logic.

### Job modes

Solid Tasks includes two core concurrency policies.

#### `JobMode.Drop`

If the job is already running and a new `perform` call happens, the new task is dropped.

This is ideal when the first action should win.

Typical examples:

- checkout button
- payment confirmation
- destructive delete button
- account creation
- file upload submit

In all of these, duplicate user intent should not create overlapping side effects.

#### `JobMode.Restart`

If the job is already running and a new `perform` call happens, the old task is aborted and replaced by the new one.

This is ideal when the latest action should win.

Typical examples:

- live search
- autocomplete
- typeahead
- tab-based data loading
- filtering/sorting dashboards
- route-driven data refresh

This mode prevents stale results from arriving late and overwriting more recent intent.

### Job and Solid ownership

A particularly elegant design choice is that jobs integrate with Solid’s owner lifecycle.

When a job is created inside a component or root, pending work is automatically aborted on cleanup.

That means job lifetime follows UI lifetime unless you deliberately create the job in a longer-lived scope.

This is exactly the kind of behavior async state libraries should have: ownership-aware by default.

---

## Why UI events should be Jobs

This is the central architectural recommendation of the library.

### The claim

**Every meaningful asynchronous UI event should be modeled as a Job, not as an ad hoc async callback.**

That includes:

- button clicks that trigger network requests
- form submissions
- search input handlers
- refresh actions
- retry buttons
- import/export actions
- wizard step submissions

### Why this is a better mental model

A user event is not just “call this async function.”  
A user event is a **reusable operation with concurrency semantics**.

When a developer writes:

```tsx
<button onClick={save}>Save</button>
```

the real unanswered question is:

- what if save is clicked twice?
- what if the user navigates away mid-save?
- what if another save starts before the first finishes?
- what if a stale completion arrives after newer state exists?

These are not optional details. They are part of the operation definition.

A `Job` makes these questions explicit.

### Ad hoc async event handling is underspecified

Consider a naive approach:

```tsx
const [isSaving, setIsSaving] = createSignal(false);
const [error, setError] = createSignal<Error | null>(null);

const save = async () => {
  setIsSaving(true);
  setError(null);

  try {
    await fetch("/api/save", { method: "POST" });
  } catch (err) {
    setError(err as Error);
  } finally {
    setIsSaving(false);
  }
};
```

This appears reasonable, but it silently leaves major issues unresolved:

- no clear duplicate-click policy
- no cancellation
- no stale-result protection
- no structured lifecycle events
- no history of last success or last abort
- manual boilerplate for every operation

Now compare that with a job:

```tsx
const saveJob = createJob(async (signal) => {
  await fetch("/api/save", {
    method: "POST",
    signal,
  });
});
```

The job approach centralizes both execution and policy. The operation becomes inspectable and composable.

### Jobs turn event handling into a formal state machine

From a software design perspective, Jobs are valuable because they convert implicit control flow into explicit state.

Instead of “sometimes this handler runs while another is pending,” you get:

- operation identity
- lifecycle
- concurrency mode
- abort semantics
- historical state

This is one of the hallmarks of maintainable systems: encode important behavior in abstractions rather than conventions.

### Jobs reduce accidental complexity

When teams write async handlers directly in components, they tend to reinvent:

- disabling buttons
- request deduplication
- abort controllers
- race prevention
- stale data handling
- retry behavior
- lifecycle cleanup

Jobs replace all of this scattered incidental complexity with one domain abstraction.

### Jobs align with user intent

A button press is not just code execution. It expresses user intent.

Examples:

- “Save this once.”
- “Search for the latest text.”
- “Refresh current data.”
- “Delete this item, but not twice.”
- “Submit whatever values are current right now.”

Those intents map naturally to job policies.

---

## Data loading

## Why data loading needs more than fetch

Data loading in UI code is deceptively tricky. As mentioned in the Scope section, while you *can* build data loaders with Jobs, be aware that you are dealing with raw primitives. For global cache-managed data, tools like TanStack Query are better suited. However, for localized, imperative data fetching, Jobs are incredibly powerful.

The surface problem seems simple:

```ts
const data = await fetch(...);
```

The real problems are:

- stale responses
- refresh while preserving old data
- cancellation on route change
- repeated loads with different parameters
- manual pending/error management
- synchronization with user intent

Jobs help because they let you model loading as a reusable, abortable operation rather than an isolated fetch call.

### Example: detail page loading

Suppose a user opens a product page, then quickly navigates to another product before the first request completes.

With a restartable job:

```ts
const loadProductJob = createJob(
  async (signal, id: string) => {
    const response = await fetch(`/api/products/${id}`, { signal });
    return response.json();
  },
  { mode: JobMode.Restart }
);
```

When the second product starts loading, the first request is aborted.

This matters because it prevents stale data from winning the race.

### Preserving previous good data during refresh

One subtle but important UI pattern is this:

- old data should stay visible
- a background refresh should start
- new data should replace the old data only when it succeeds

Jobs support this elegantly through task history.

You can render from `job.lastFulfilled?.value` while separately showing a spinner from `job.isPending`.

That creates a high-quality user experience:

- no empty flicker
- no premature data clearing
- no need for separate “cached data” state

### Route-driven loading

A common pattern in Solid apps is loading whenever a route param changes.

```ts
createEffect(() => {
  loadProductJob.perform(params.id);
});
```

If the params change rapidly, `JobMode.Restart` ensures only the latest route state matters.

### Why this helps academically

From a systems viewpoint, data loading is not just retrieval. It is a coordination problem between:

- user navigation
- network latency
- UI consistency
- component lifetime
- cache/display strategy

Jobs help because they treat loading as a controlled process rather than a side effect.

---

## Mutation workflows

Mutations are where `JobMode.Drop` becomes especially compelling.

### Example: save profile

```ts
const saveProfileJob = createJob(
  async (signal, form: ProfileInput) => {
    const response = await fetch("/api/profile", {
      method: "POST",
      body: JSON.stringify(form),
      headers: {
        "Content-Type": "application/json",
      },
      signal,
    });

    if (!response.ok) {
      throw new Error("Failed to save profile");
    }

    return response.json();
  },
  { mode: JobMode.Drop }
);
```

This creates a strong behavioral guarantee:

- only one save is active at a time
- repeated clicks do not create duplicate submissions
- the UI can react to pending/error/success using one object

### Why mutations benefit from drop mode

In many mutation flows, a second click is not “newer truth.” It is usually noise, impatience, or accidental repetition.

Examples:

- checkout
- purchase confirmation
- invitation sending
- password reset
- newsletter signup
- destructive actions

For these cases, the first execution should be respected, and later overlapping attempts should be refused.

### UI ergonomics

```tsx
<button
  type="button"
  disabled={saveProfileJob.isPending}
  onClick={() => saveProfileJob.perform(form())}
>
  {saveProfileJob.isPending ? "Saving..." : "Save profile"}
</button>
```

No extra loading signal required.

---

## Concurrency patterns

Concurrency is the real intellectual heart of this library.

The major insight of Solid Tasks is this:

**Async work should not only be executable; it should also have a declared overlap policy.**

### Pattern 1: First wins

Use `Drop` when the first invocation should continue and later ones should be ignored.

Examples:

- purchase button
- form submit
- file upload
- “send verification email”

### Pattern 2: Latest wins

Use `Restart` when the newest invocation supersedes the old one.

Examples:

- search as you type
- filtering
- sorting
- reloading on route param changes
- selecting a new entity in a master-detail UI

### Pattern 3: One-off operation

Use a `Task` directly when you do not need repeatability or job-level policy.

Examples:

- an isolated internal async step
- a one-time setup action
- composing a larger job from smaller abortable units

### Why explicit policies matter

Without explicit policy, concurrency bugs emerge as timing-dependent failures:

- duplicate mutations
- stale UI state
- flickering result lists
- inconsistent error messages
- response ordering bugs

With explicit policy, concurrency becomes a property of design rather than accident.

---

## Abort handling

## Cancellation is not failure

One of the most important conceptual contributions of this library is the separation of cancellation from failure.

When a request is aborted because it became obsolete, that is not the same as a network error.

Solid Tasks models this explicitly through `TaskAbortError`.

That allows application logic to make better decisions.

### Example

```ts
try {
  await searchJob.perform(query);
} catch (error) {
  if (error instanceof TaskAbortError) {
    return;
  }

  console.error("Real failure:", error);
}
```

This distinction is crucial for serious applications.

If you treat aborted work as generic failure, you risk:

- showing useless error messages
- polluting logs
- triggering false retries
- confusing analytics

### Timeout helper

The library provides:

```ts
await timeout(signal, ms);
```

This is more than a convenience function. It gives you an abortable delay primitive.

That is useful for:

- debouncing
- retry backoff
- staged workflows
- UX pacing
- optimistic delay windows

Example:

```ts
const searchJob = createJob(
  async (signal, query: string) => {
    await timeout(signal, 250);

    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal,
    });

    return response.json();
  },
  { mode: JobMode.Restart }
);
```

If the query changes during the 250ms wait, the delay itself is aborted. This means the system stops wasted work early.

### `work(signal, promise)`

`work` is the lower-level primitive used to race arbitrary async work against cancellation.

This is valuable when integrating non-fetch promises into the same abort-aware flow.

---

## Real-world examples

## 1. Search input

This is the classic `Restart` case.

```tsx
import { createJob, JobMode, timeout } from "solid-tasks";

const searchJob = createJob(
  async (signal, query: string) => {
    if (!query.trim()) return [];

    await timeout(signal, 200);

    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal,
    });

    if (!response.ok) throw new Error("Search failed");
    return response.json();
  },
  { mode: JobMode.Restart }
);
```

```tsx
<input
  type="text"
  onInput={(e) => searchJob.perform(e.currentTarget.value)}
/>

<Show when={searchJob.isPending}>
  <p>Searching...</p>
</Show>

<Show when={searchJob.lastFulfilled?.value}>
  {(results) => (
    <ul>
      <For each={results()}>
        {(item) => <li>{item.name}</li>}
      </For>
    </ul>
  )}
</Show>
```

Why this works well:

- rapid typing does not create stale result races
- old requests are cancelled
- old results can remain visible until new ones arrive
- the loading state is derived directly from the job

---

## 2. Save button

This is the classic `Drop` case.

```tsx
const saveJob = createJob(
  async (signal, payload: FormDataShape) => {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) throw new Error("Save failed");
    return response.json();
  },
  { mode: JobMode.Drop }
);
```

```tsx
<button
  type="button"
  disabled={saveJob.isPending}
  onClick={() => saveJob.perform(form())}
>
  {saveJob.isPending ? "Saving..." : "Save"}
</button>
```

Why this works well:

- duplicate clicks are suppressed structurally
- UI disable state and async state come from the same source
- errors and successful results are preserved on the job

---

## 3. Tab-driven detail loading

```tsx
const loadReportJob = createJob(
  async (signal, reportId: string) => {
    const response = await fetch(`/api/reports/${reportId}`, { signal });
    if (!response.ok) throw new Error("Load failed");
    return response.json();
  },
  { mode: JobMode.Restart }
);

createEffect(() => {
  loadReportJob.perform(selectedReportId());
});
```

Why this works well:

- changing tabs rapidly does not let older responses overwrite newer ones
- the latest user choice is authoritative
- stale requests are actively aborted

---

## 4. Retry with backoff

```ts
const loadWithRetryJob = createJob(
  async (signal, url: string) => {
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error("Request failed");
        return await response.json();
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw error;
        await timeout(signal, 500 * (attempt + 1));
      }
    }

    throw lastError;
  },
  { mode: JobMode.Restart }
);
```

Why this works well:

- retries remain abort-aware
- backoff delay is also cancellable
- restarting the job cancels both current request and waiting periods

---

## 5. Todo button from the project’s usage pattern

A very practical pattern is a job that guards a button-driven mutation so repeated clicks do not create repeated effects.

```tsx
import { createArray } from "solid-proxies";
import { createJob, timeout } from "solid-tasks";

export function TodoList() {
  const todos = createArray<string>([]);

  const addTodo = createJob(async (signal) => {
    await timeout(signal, 1000);
    todos.push("✅ I have been clicked");
  });

  return (
    <div>
      <button onClick={() => addTodo.perform()} type="button">
        {addTodo.isPending ? "Loading..." : "Add todo"}
      </button>

      <ul>
        {todos.map((todo) => (
          <li>{todo}</li>
        ))}
      </ul>
    </div>
  );
}
```

Architecturally, this example is important because it shows that jobs are not only for network requests. They are for any asynchronous effect that must obey concurrency rules.

---

## Design guidelines

### Prefer Jobs for user-triggered async operations

If the user can initiate the operation multiple times, it is almost always a job.

### Pass the signal all the way down

If your job or task receives a signal, use it in the underlying async APIs whenever possible.

Good:

```ts
fetch(url, { signal });
```

Less good:

```ts
fetch(url);
```

If you ignore the signal, the task can still transition to aborted state, but the underlying work may continue wasting resources.

### Think policy first

Before choosing `Drop` or `Restart`, ask:

- should the first intent win?
- should the latest intent win?
- should repeats be impossible?
- is this mutation or query behavior?

### Keep UI derived from job state

Prefer:

- `job.isPending`
- `job.lastFulfilled`
- `job.lastRejected`

over manual duplicated signals whenever possible.

### Treat cancellation separately from failure

Do not show “Something went wrong” messages for operations that were intentionally aborted.

### Preserve previous successful data during refresh

Using `lastFulfilled` as the display source while `isPending` is true often produces a much smoother UI than clearing data eagerly.

---

## When to use Tasks directly

Use `Task` directly when you need a single abortable async execution but do not need repeatable policy.

Examples:

- composing internal helper steps
- one-shot startup logic
- lower-level building blocks inside a more complex abstraction
- custom orchestration where you deliberately manage instances yourself

Example:

```ts
const preloadTask = createTask(async (signal) => {
  const response = await fetch("/api/bootstrap", { signal });
  return response.json();
});

await preloadTask.perform();
```

A task is the right abstraction when the identity of the single run matters more than reusable operation policy.

---

## When to use Jobs

Use `Job` when the operation:

- can happen more than once
- is tied to user interaction
- needs overlap policy
- needs task history
- needs easy UI binding
- benefits from automatic cleanup in Solid owner scope

As a rule of thumb:

- **Task** = one run
- **Job** = reusable async behavior with concurrency semantics

---

## Testing strategy

Solid Tasks encourages a very testable architecture because it makes async behavior explicit.

You can test:

- idle to pending transition
- fulfillment and rejection
- cancellation behavior
- event dispatch
- duplicate-trigger behavior in `Drop` mode
- restart semantics in `Restart` mode
- component integration using real UI interaction

A good test suite should verify not only final values but also lifecycle transitions and concurrency guarantees.

Examples of what to test:

- calling `perform()` sets pending state
- aborting produces `TaskAbortError`
- `Drop` mode ignores overlapping runs
- `Restart` mode cancels previous task
- `lastFulfilled`, `lastRejected`, and `lastAborted` update as expected
- cleanup aborts pending work when component scope is disposed

This style of testing is stronger than testing “did fetch get called?” because it checks the behavioral contract of the abstraction.

---

## API reference

## `createTask`

```ts
const task = createTask<T>(async (signal) => {
  // async work
  return value;
});
```

### Task properties

- `task.value`
- `task.error`
- `task.status`
- `task.signal`
- `task.isIdle`
- `task.isPending`
- `task.isFulfilled`
- `task.isRejected`
- `task.isSettled`
- `task.isAborted`

### Task methods

```ts
task.perform();
task.abort(reason?);
task.then(...);
task.catch(...);
task.finally(...);
task.addEventListener(type, listener, options?);
task.removeEventListener(type, listener, options?);
```

### Task events

- `"abort"`
- `"fulfill"`
- `"reject"`

---

## `createJob`

```ts
const job = createJob<T, Args>(
  async (signal, ...args) => {
    return value;
  },
  {
    mode: JobMode.Drop,
  }
);
```

### Job properties

- `job.status`
- `job.isIdle`
- `job.isPending`
- `job.performCount`
- `job.lastPending`
- `job.lastFulfilled`
- `job.lastRejected`
- `job.lastSettled`
- `job.lastAborted`

### Job methods

```ts
job.perform(...args);
job.abort(reason?);
```

---

## `JobMode`

```ts
JobMode.Drop
JobMode.Restart
```

### `Drop`

- keep first active task
- drop overlapping new invocations

### `Restart`

- abort current active task
- start new task immediately

---

## `TaskStatus`

```ts
TaskStatus.Idle
TaskStatus.Pending
TaskStatus.Fulfilled
TaskStatus.Rejected
TaskStatus.Aborted
```

---

## `TaskAbortError`

The error type used to represent intentional task cancellation.

Use it to distinguish aborts from genuine failures.

```ts
try {
  await task.perform();
} catch (error) {
  if (error instanceof TaskAbortError) {
    return;
  }

  throw error;
}
```

---

## `work`

```ts
await work(signal, promise);
```

Runs a promise in an abort-aware way by racing it against the provided signal.

Use this when you need to adapt arbitrary promise-based code into the cancellation model used by tasks and jobs.

---

## `timeout`

```ts
await timeout(signal, 1000);
```

Creates an abortable delay.

Useful for:

- debouncing
- retry backoff
- staged workflows
- controlled pacing

---

## Final perspective

Solid Tasks is not merely a convenience wrapper around promises. It is a disciplined async model for Solid.js.

Its key contribution is conceptual clarity:

- a **Task** models one async execution
- a **Job** models a repeatable async operation with policy
- cancellation is explicit
- concurrency is designed, not accidental
- UI derives directly from lifecycle state

If a codebase treats asynchronous events as raw callbacks, concurrency bugs eventually become inevitable. If it treats them as jobs, the behavior becomes explicit, testable, and understandable.

That is why this library is most powerful not as a helper, but as an architectural pattern for building complex interactive systems.