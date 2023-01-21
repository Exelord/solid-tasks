<p align="center">
  <img height="400" src="https://raw.githubusercontent.com/exelord/solid-tasks/main/logo.png" alt="Solid Tasks logo" />
</p>

# Solid Tasks

Solid Tasks is a package for managing and controlling async operations in solid-js applications. It provides a simple API for controlling the execution of promises and their cancellation. With Solid Tasks, it is easy to build robust and performant solid-js applications, especially when it comes to handling data fetching, events, and user interactions.

## Installation

To install Solid Tasks can use npm:

```sh
npm install solid-tasks
```

## Requirements

- Solid.js v1.0.0 or higher
- Environment that supports [AbortController API](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)

## What are solid-tasks?

It is a plugin for solid-js that allows you to manage async operations in your application. It provides a way to perform and cancel async operations, and observe their state. solid-tasks uses jobs to coordinate async operations. By creating a job and performing it, you can execute a task and handle its cancellation and coordination. Jobs can be created in different modes that allows to handle different use cases such as button clicks, data loading, live search fields or long-polling.

## Jobs

A job is a way to coordinate async operations in your application. It provides a way to perform and cancel async operations, and observe their state. With solid-tasks, you can create jobs that allow you to handle cancellation and coordination of async operations. For example, you can use a job to handle a button click and prevent unexpected events from clicking it multiple times.
