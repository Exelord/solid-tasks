import { createArray } from "solid-proxies";
import { createJob } from "../../src/job";
import { timeout } from "../../src/work";

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
