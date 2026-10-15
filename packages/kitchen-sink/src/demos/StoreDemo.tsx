/**
 * Store Demo
 * Tests: createStore, the setter's draft, reconcile, snapshot
 *
 * NOTE: This file uses clean syntax that the compiler transforms.
 * Store access like `state.count` is automatically wrapped.
 */

import {
  For,
  Show,
  createEffect,
  createSignal,
  createStore,
  reconcile,
  snapshot,
} from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, DemoCard, DemoSection } from "./shared";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

interface User {
  name: string;
  email: string;
  preferences: {
    theme: "light" | "dark";
    notifications: boolean;
  };
}

export function StoreDemo() {
  return (
    <DemoSection>
      <BasicStoreDemo />
      <NestedStoreDemo />
      <TodoStoreDemo />
      <DraftSetterDemo />
      <ReconcileDemo />
    </DemoSection>
  );
}

// Basic store usage
function BasicStoreDemo() {
  const [state, setState] = createStore({
    count: 0,
    message: "Hello",
  });

  return (
    <DemoCard title="Basic Store">
      <p>
        Count: <strong>{state.count}</strong>
      </p>
      <p>
        Message: <strong>{state.message}</strong>
      </p>

      <div class={buttonRowStyle}>
        <Button
          onClick={() =>
            setState((s) => {
              s.count += 1;
            })
          }
        >
          Increment
        </Button>
        <Button
          onClick={() =>
            setState((s) => {
              s.count = 0;
            })
          }
        >
          Reset
        </Button>
        <Button
          onClick={() =>
            setState((s) => {
              s.message = "Updated!";
            })
          }
        >
          Update Message
        </Button>
      </div>

      <p class={noteStyle}>
        Store provides fine-grained reactivity - only subscribed paths update.
      </p>
    </DemoCard>
  );
}

// Nested store paths
function NestedStoreDemo() {
  const [user, setUser] = createStore<User>({
    name: "John Doe",
    email: "john@example.com",
    preferences: {
      theme: "dark",
      notifications: true,
    },
  });

  // Signal to hold the raw JSON snapshot
  const [rawJson, setRawJson] = createSignal("");

  // The compute tracks the store and takes the raw value; the apply stores it
  createEffect(
    () => {
      // Access through proxy to track changes
      user.name;
      user.email;
      user.preferences.theme;
      user.preferences.notifications;

      // Get raw object as JSON
      return JSON.stringify(snapshot(user), null, 2);
    },
    (json) => {
      setRawJson(json);
    },
  );

  return (
    <DemoCard title="Nested Store Paths">
      <div class={fieldStyle}>
        <label>
          Name:
          <input
            type="text"
            value={user.name}
            onInput={(e: Event) => {
              const value = (e.target as HTMLInputElement).value;
              setUser((u) => {
                u.name = value;
              });
            }}
            class={inputStyle}
          />
        </label>
      </div>

      <div class={fieldStyle}>
        <label>
          Email:
          <input
            type="text"
            value={user.email}
            onInput={(e: Event) => {
              const value = (e.target as HTMLInputElement).value;
              setUser((u) => {
                u.email = value;
              });
            }}
            class={inputStyle}
          />
        </label>
      </div>

      <div class={fieldStyle}>
        <label>
          Theme:
          <select
            value={user.preferences.theme}
            onChange={(e: Event) => {
              const value = (e.target as HTMLSelectElement).value as "light" | "dark";
              setUser((u) => {
                u.preferences.theme = value;
              });
            }}
            class={selectStyle}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div class={fieldStyle}>
        <label>
          <input
            type="checkbox"
            checked={user.preferences.notifications}
            onChange={() =>
              setUser((u) => {
                u.preferences.notifications = !u.preferences.notifications;
              })
            }
          />
          Enable Notifications
        </label>
      </div>

      <pre class={previewStyle}>
        {/* Rendered from signal updated by effect with snapshot() */}
        {rawJson}
      </pre>

      <p class={noteStyle}>
        Effect tracks store → <code>snapshot()</code> gets raw object → updates signal for display.
      </p>
    </DemoCard>
  );
}

// Todo list with store
function TodoStoreDemo() {
  const [state, setState] = createStore({
    todos: [] as Todo[],
    filter: "all" as "all" | "active" | "completed",
    nextId: 1,
  });

  const [inputValue, setInputValue] = createStore({ text: "" });

  const addTodo = () => {
    const text = inputValue.text.trim();
    if (!text) return;

    setState((s) => {
      s.todos.push({ id: s.nextId, text, completed: false });
      s.nextId += 1;
    });
    setInputValue((s) => {
      s.text = "";
    });
  };

  const toggleTodo = (id: number) => {
    setState((s) => {
      const todo = s.todos.find((t) => t.id === id);
      if (todo) todo.completed = !todo.completed;
    });
  };

  const removeTodo = (id: number) => {
    setState((s) => {
      const index = s.todos.findIndex((todo) => todo.id === id);
      if (index !== -1) s.todos.splice(index, 1);
    });
  };

  const filteredTodos = () => {
    const todos = state.todos;
    switch (state.filter) {
      case "active":
        return todos.filter((t) => !t.completed);
      case "completed":
        return todos.filter((t) => t.completed);
      default:
        return todos;
    }
  };

  return (
    <DemoCard title="Todo List Store">
      <div class={inputRowStyle}>
        <input
          type="text"
          value={inputValue.text}
          onInput={(e: Event) => {
            const value = (e.target as HTMLInputElement).value;
            setInputValue((s) => {
              s.text = value;
            });
          }}
          onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && addTodo()}
          placeholder="Add a todo..."
          class={inputStyle}
        />
        <Button onClick={addTodo}>Add</Button>
      </div>

      <div class={filterRowStyle}>
        <Button
          variant={state.filter === "all" ? "primary" : "secondary"}
          onClick={() =>
            setState((s) => {
              s.filter = "all";
            })
          }
        >
          All
        </Button>
        <Button
          variant={state.filter === "active" ? "primary" : "secondary"}
          onClick={() =>
            setState((s) => {
              s.filter = "active";
            })
          }
        >
          Active
        </Button>
        <Button
          variant={state.filter === "completed" ? "primary" : "secondary"}
          onClick={() =>
            setState((s) => {
              s.filter = "completed";
            })
          }
        >
          Completed
        </Button>
      </div>

      <Show
        when={filteredTodos().length > 0}
        fallback={<div class={emptyStyle}>No todos yet!</div>}
      >
        <ul class={todoListStyle}>
          <For each={filteredTodos}>
            {(todo: Todo) => (
              <li class={todoItemStyle}>
                <label class={() => (todo.completed ? completedStyle : "")}>
                  <input
                    type="checkbox"
                    checked={() => todo.completed}
                    onChange={() => toggleTodo(todo.id)}
                  />
                  {todo.text}
                </label>
                <button type="button" class={deleteButtonStyle} onClick={() => removeTodo(todo.id)}>
                  Delete
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </DemoCard>
  );
}

// The setter's draft: mutable-style updates
function DraftSetterDemo() {
  const [state, setState] = createStore({
    users: [
      { id: 1, name: "Alice", score: 100 },
      { id: 2, name: "Bob", score: 85 },
      { id: 3, name: "Charlie", score: 92 },
    ],
  });

  const incrementScore = (id: number) => {
    setState((s) => {
      const user = s.users.find((u) => u.id === id);
      if (user) user.score += 10;
    });
  };

  const sortByScore = () => {
    setState((s) => {
      s.users.sort((a, b) => b.score - a.score);
    });
  };

  return (
    <DemoCard title="Draft Setter - Mutable-Style Updates">
      <ul class={userListStyle}>
        <For each={state.users}>
          {(user: { id: number; name: string; score: number }) => (
            <li class={userItemStyle}>
              <span>
                {user.name}: <strong>{() => user.score}</strong> points
              </span>
              <Button onClick={() => incrementScore(user.id)}>+10</Button>
            </li>
          )}
        </For>
      </ul>

      <Button onClick={sortByScore}>Sort by Score</Button>

      <p class={noteStyle}>
        The setter hands its callback a draft: mutate it in place and only what changed notifies.
      </p>
    </DemoCard>
  );
}

// reconcile for efficient diffing
function ReconcileDemo() {
  const [state, setState] = createStore({
    items: [
      { id: 1, value: "A" },
      { id: 2, value: "B" },
      { id: 3, value: "C" },
    ],
  });

  const fetchNewData = () => {
    // Simulate fetching new data from server
    const newItems = [
      { id: 1, value: "A (updated)" },
      { id: 3, value: "C" },
      { id: 4, value: "D (new)" },
    ];

    setState((s) => {
      reconcile(newItems, "id")(s.items);
    });
  };

  const shuffleItems = () => {
    const shuffled = [...state.items].sort(() => Math.random() - 0.5);
    setState((s) => {
      reconcile(shuffled, "id")(s.items);
    });
  };

  return (
    <DemoCard title="reconcile - Efficient Diffing">
      <ul class={userListStyle}>
        <For each={state.items}>
          {(item: { id: number; value: string }) => (
            <li class={userItemStyle}>
              ID: {item.id}, Value: <strong>{() => item.value}</strong>
            </li>
          )}
        </For>
      </ul>

      <div class={buttonRowStyle}>
        <Button onClick={fetchNewData}>Fetch New Data</Button>
        <Button onClick={shuffleItems}>Shuffle</Button>
      </div>

      <p class={noteStyle}>reconcile() efficiently diffs arrays by key, minimizing DOM updates.</p>
    </DemoCard>
  );
}

// Styles
const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
`;

const inputRowStyle = css`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

const filterRowStyle = css`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const fieldStyle = css`
  margin-bottom: 12px;

  label {
    display: block;
    margin-bottom: 4px;
    color: #94a3b8;
    font-size: 14px;
  }
`;

const inputStyle = css`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const selectStyle = css`
  padding: 8px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const previewStyle = css`
  background: #0f172a;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #94a3b8;
  overflow-x: auto;
  margin-top: 12px;
`;

const todoListStyle = css`
  list-style: none;
  margin: 0;
`;

const todoItemStyle = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 8px;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
`;

const completedStyle = css`
  text-decoration: line-through;
  color: #64748b;
`;

const deleteButtonStyle = css`
  padding: 4px 8px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: #dc2626;
  }
`;

const emptyStyle = css`
  padding: 24px;
  text-align: center;
  color: #64748b;
  background: #1e293b;
  border-radius: 8px;
`;

const userListStyle = css`
  list-style: none;
  margin: 0 0 12px 0;
`;

const userItemStyle = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 8px;
`;

const noteStyle = css`
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 12px;
`;
