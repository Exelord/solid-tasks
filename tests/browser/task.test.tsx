import { test, expect } from "@playwright/experimental-ct-solid";
import { TodoList } from "../fixtures/todo-list";

test("adds only one todo even when clicked twice", async ({ mount, page }) => {
  await mount(<TodoList />);

  const addTodo = page.getByRole("button", { name: "Add todo" });

  await Promise.allSettled([addTodo.click(), addTodo.click()]);

  await expect(addTodo).toHaveText("Add todo");
  await expect(page.getByText("✅ I have been clicked")).toHaveCount(1);
});
