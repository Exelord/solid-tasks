# Job

A job is a 

## API

### Properties

- `value` - The result of a successful Task execution.
- `error` - The reason why a Task execution was unsuccessful.
- `status` - The current status of the Task. Can be: `idle`, `pending`, `fulfilled`, `rejected`, or `aborted`.
- `isIdle` - A boolean indicating whether the Task is idle.
- `isPending` - A boolean indicating whether the Task is pending.
- `isFulfilled` - A boolean indicating whether the Task was successful.
- `isRejected` - A boolean indicating whether the Task was unsuccessful.
- `isSettled` - A boolean indicating whether the Task has completed (fulfilled or rejected).
- `isAborted` - A boolean indicating whether the Task was cancelled.
- `signal` - An AbortSignal object for interpolation with signal-supported solution.

### Methods

- `perform()` - Starts execution of the Task.
- `abort(cancelReason)` - Aborts the Task with an optional cancel reason.
- `then(onFulfilled, onRejected)` - Registers callbacks to be called when the Task is fulfilled or rejected.
- `catch(onRejected)` - Registers a callback to be called when the Task is rejected.
- `finally(onFinally)` - Registers a callback to be called when the Task is settled.
- `addEventListener(type, listener, options)` - Registers an event listener for Task events.
- `removeEventListener(type, listener, options)` - Removes an event listener for Task events.

### Events

- `fulfill` - Triggered when the Task is fulfilled.
- `reject` - Triggered when the Task is rejected.
- `abort` - Triggered when the Task is cancelled.
