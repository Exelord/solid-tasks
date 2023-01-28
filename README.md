<p align="center">
  <img height="400" src="https://raw.githubusercontent.com/exelord/solid-tasks/main/logo.png" alt="Solid Tasks logo" />
</p>

# Solid Tasks

Solid Tasks is a package for managing and controlling concurrent operations in Solid.js applications.
It provides a simple API for controlling the execution of promises and events. With Solid Tasks, you can forget about manual cancellation, concurrency side-effects and make your app user proof.

## Installation

```sh
npm install solid-tasks
```

## Requirements

- Solid.js v1.0.0 or higher

## How to use it?

## Drop mode

```tsx
import { createJob, work } from "solid-tasks";

const saveDataJob = createJob(async (signal) => {
  await work(signal, saveData)
  console.log('Data saved');
}, { mode: "drop"});

saveDataJob.perform(); // Task1: Pending...
saveDataJob.perform(); // Task2: Aborted. Another task is pending.
```

## Restart mode

```tsx
import { createJob, work } from "solid-tasks";

const saveDataJob = createJob(async (signal) => {
  await work(signal, saveData)
  console.log('Data saved');
}, { mode: "restart"});

saveDataJob.perform(); // Task1: Pending...
saveDataJob.perform(); // Task2: Aborting Task1. Pending...
```
