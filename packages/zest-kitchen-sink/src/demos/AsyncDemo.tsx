/**
 * Async & Resources Demo
 * Tests: useResource, Suspense, Await
 */

import { Await, ErrorBoundary, Show, Suspense, useResource, useState } from "@barqjs/core";
import { css } from "@barqjs/extra";
import { Button, DemoCard, DemoSection } from "./shared";

interface User {
  id: number;
  name: string;
  email: string;
  bio?: string;
}

export function AsyncDemo() {
  return (
    <DemoSection>
      <ResourceDemo />
      <ResourceWithSourceDemo />
      <AwaitDemo />
      <ErrorResourceDemo />
      <RefetchDemo />
    </DemoSection>
  );
}

// Basic useResource
function ResourceDemo() {
  const users = useResource(
    () => "users",
    async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json() as Promise<User[]>;
    },
  );

  return (
    <DemoCard title="useResource - Basic">
      <Show when={() => users.loading()}>
        <div class={loadingStyle}>Loading users...</div>
      </Show>

      <Show when={() => users.error()}>
        <div class={errorStyle}>Error: {() => users.error()?.message}</div>
      </Show>

      <Show when={() => !users.loading() && !users.error() && users()}>
        <ul class={listStyle}>
          {() =>
            users()?.map((user) => (
              <li class={listItemStyle}>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </li>
            ))
          }
        </ul>
      </Show>

      <Button onClick={() => users.refetch()}>Refetch</Button>
    </DemoCard>
  );
}

// useResource with reactive source
function ResourceWithSourceDemo() {
  const [userId, setUserId] = useState(1);

  const user = useResource(
    () => userId(),
    async (id) => {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json() as Promise<User>;
    },
  );

  return (
    <DemoCard title="useResource - Reactive Source">
      <div class={buttonRowStyle}>
        <Button onClick={() => setUserId(1)}>User 1</Button>
        <Button onClick={() => setUserId(2)}>User 2</Button>
        <Button onClick={() => setUserId(3)}>User 3</Button>
      </div>

      <p>
        Selected user ID: <strong>{userId}</strong>
      </p>

      <div class={resultBoxStyle}>
        <Show when={() => user.loading()}>
          <div class={loadingStyle}>Loading user {userId}...</div>
        </Show>

        <Show when={() => !user.loading() && user()}>
          <div>
            <p>
              <strong>Name:</strong> {() => user()?.name}
            </p>
            <p>
              <strong>Email:</strong> {() => user()?.email}
            </p>
            <p>
              <strong>Bio:</strong> {() => user()?.bio || "No bio"}
            </p>
          </div>
        </Show>
      </div>

      <p class={noteStyle}>Resource automatically refetches when source signal changes.</p>
    </DemoCard>
  );
}

// Await component
function AwaitDemo() {
  const [fetchId, setFetchId] = useState(0);

  const slowData = useResource(
    () => fetchId(),
    async () => {
      if (fetchId() === 0) return null;
      const res = await fetch("/api/slow");
      return res.json();
    },
  );

  return (
    <DemoCard title="Await - Resource State Rendering">
      <Button onClick={() => setFetchId((id) => id + 1)}>Fetch Slow Data</Button>

      <div class={resultBoxStyle}>
        <Await
          resource={slowData}
          loading={<div class={loadingStyle}>Waiting for slow response...</div>}
          error={(err) => <div class={errorStyle}>Error: {err.message}</div>}
        >
          {(data) => (
            <Show when={() => data !== null} fallback={<p>Click button to fetch</p>}>
              <div class={successStyle}>Response: {() => JSON.stringify(data)}</div>
            </Show>
          )}
        </Await>
      </div>

      <p class={noteStyle}>Await renders different content based on resource state.</p>
    </DemoCard>
  );
}

// Error handling
function ErrorResourceDemo() {
  const [shouldFetch, setShouldFetch] = useState(false);

  const errorData = useResource(
    () => shouldFetch(),
    async (doFetch) => {
      if (!doFetch) return null;
      const res = await globalThis.fetch("/api/error");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  );

  return (
    <DemoCard title="Resource Error Handling">
      <Button onClick={() => setShouldFetch(true)}>Fetch (will fail)</Button>

      <div class={resultBoxStyle}>
        <Show when={() => errorData.loading()}>
          <div class={loadingStyle}>Fetching...</div>
        </Show>

        <Show when={() => errorData.error()}>
          <div class={errorStyle}>
            <strong>Error caught:</strong>
            <p>{() => errorData.error()?.message}</p>
            <Button onClick={() => errorData.refetch()}>Retry</Button>
          </div>
        </Show>

        <Show when={() => !shouldFetch() && !errorData.loading() && !errorData.error()}>
          <p>Click button to trigger an error</p>
        </Show>
      </div>

      <p class={noteStyle}>Resources expose error state for graceful error handling.</p>
    </DemoCard>
  );
}

// Manual refetch and mutate
function RefetchDemo() {
  const [counter, setCounter] = useState(0);

  const data = useResource(
    () => null,
    async () => {
      const res = await fetch("/api/users");
      return res.json() as Promise<User[]>;
    },
  );

  const handleMutate = () => {
    // Optimistically update the data
    data.mutate([{ id: 999, name: "Optimistic User", email: "optimistic@example.com" }]);
    setCounter((c) => c + 1);
  };

  return (
    <DemoCard title="Refetch & Mutate">
      <p>
        Mutation count: <strong>{counter}</strong>
      </p>

      <div class={buttonRowStyle}>
        <Button onClick={() => data.refetch()}>Refetch</Button>
        <Button onClick={handleMutate}>Optimistic Update</Button>
      </div>

      <div class={resultBoxStyle}>
        <Show when={() => data.loading()}>
          <div class={loadingStyle}>Loading...</div>
        </Show>

        <Show when={() => !data.loading() && data()}>
          <ul class={compactListStyle}>
            {() =>
              data()
                ?.slice(0, 3)
                .map((user) => <li>{user.name}</li>)
            }
          </ul>
        </Show>
      </div>

      <p class={noteStyle}>
        mutate() updates data without refetching (useful for optimistic updates).
      </p>
    </DemoCard>
  );
}

// Styles
const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`;

const loadingStyle = css`
  padding: 16px;
  background: #1e3a5f;
  border-radius: 8px;
  color: #60a5fa;
`;

const errorStyle = css`
  padding: 16px;
  background: #7f1d1d;
  border-radius: 8px;
  color: #fecaca;

  strong {
    display: block;
    margin-bottom: 8px;
  }

  p {
    margin-bottom: 12px;
  }
`;

const successStyle = css`
  padding: 16px;
  background: #14532d;
  border-radius: 8px;
  color: #bbf7d0;
`;

const listStyle = css`
  list-style: none;
  margin: 0 0 12px 0;
`;

const listItemStyle = css`
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 8px;
`;

const compactListStyle = css`
  list-style: disc;
  margin: 0;
  padding-left: 20px;
`;

const resultBoxStyle = css`
  margin: 16px 0;
  min-height: 60px;
`;

const noteStyle = css`
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 12px;
`;
