/**
 * Async & Resources Demo
 * Tests: resource, Loading, Errored
 *
 * NOTE: resource returns accessors that need explicit () calls.
 * The compiler handles JSX expressions but resource methods need manual calls.
 */

import { Errored, For, Loading, Reveal, Show, resource, signal } from "@barqjs/core";
import {
  css,
} from "../styles";
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
      <LoadingBoundaryDemo />
      <RevealOrderDemo />
      <ErrorResourceDemo />
      <RefetchDemo />
    </DemoSection>
  );
}

/**
 * A nested `<Reveal>` group (A6). The inner group is ONE slot of the outer, so
 * `posts` cannot appear before `header` under `sequential` however fast it
 * lands — and under `together` the whole page arrives at once.
 *
 * The delays are deliberately in the wrong order: `posts` is the fastest and is
 * registered second, which is the only arrangement under which the three orders
 * are distinguishable from one another.
 */
function RevealOrderDemo() {
  const run = signal(0);
  const order = signal<"sequential" | "together" | "natural">("sequential");

  return (
    <DemoCard title="Reveal - nested ordering">
      <div class={controlsStyle}>
        <Button onClick={() => run.update((n) => n + 1)}>Load</Button>
        <For each={() => ["sequential", "together", "natural"] as const}>
          {(mode) => (
            <Button
              onClick={() => {
                order.set(mode);
                run.update((n) => n + 1);
              }}
            >
              {mode}
            </Button>
          )}
        </For>
        <span class={noteStyle}>
          order: <strong data-testid="reveal-order">{() => order()}</strong>
        </span>
      </div>

      <div class={resultBoxStyle} data-testid="reveal-group">
        {/*
          KEYED on the run counter, so each press is a new instance (K1.1's
          opt-in arm). Non-keyed, the second press is a REVALIDATION: a Loading
          boundary that has already revealed keeps its stale content and never
          shows a fallback again, so the group would look like it revealed
          everything at once whatever the order said.
        */}
        <Show when={() => run()} keyed fallback={<p>Click Load to start the group</p>}>
          <Reveal order={() => order()} collapsed={true}>
            <Slot name="header" delay={900} run={run()} />
            <Reveal order="natural">
              <Slot name="posts" delay={200} run={run()} />
              <Slot name="comments" delay={1500} run={run()} />
            </Reveal>
          </Reveal>
        </Show>
      </div>

      <p class={noteStyle}>
        `posts` settles first (200ms), then `header` (900ms), then `comments` (1500ms). Under
        `sequential` nothing below `header` may show before it does — the inner group is ONE slot,
        held whole; once `header` lands the group is released and runs its own `natural` order, so
        `posts` appears without waiting for `comments`. `collapsed` is on for all three and only
        `sequential` consults it, which is why the tail is blank under that order and shows its
        fallbacks under the other two.
      </p>
    </DemoCard>
  );
}

function Slot(props: { name: string; delay: number; run: number }) {
  const data = resource(
    () => `${props.name()}:${props.run()}`,
    async () => {
      // `run` is in the URL as well as in the source key: without it the second
      // press replays Chrome's HTTP cache and every slot settles in the same
      // microtask, which reads exactly like a group that reveals all at once.
      const res = await fetch(
        `/api/staggered?name=${props.name()}&delay=${props.delay()}&run=${props.run()}`,
      );
      return res.json() as Promise<{ name: string; at: number }>;
    },
  );

  return (
    <Loading
      fallback={
        <div class={loadingStyle} data-slot={props.name} data-state="pending">
          {props.name}
          …
        </div>
      }
    >
      <div class={successStyle} data-slot={props.name} data-state="ready">
        {() => `${data().name} ready`}
      </div>
    </Loading>
  );
}

// Basic resource
function ResourceDemo() {
  const users = resource(
    () => "users",
    async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json() as Promise<User[]>;
    },
  );

  return (
    <DemoCard title="resource - Basic">
      <Show when={users.loading()}>
        <div class={loadingStyle}>Loading users...</div>
      </Show>

      <Show when={users.error()}>
        <div class={errorStyle}>Error: {users.error()?.message}</div>
      </Show>

      <Show when={!users.loading() && !users.error() && users()}>
        <ul class={listStyle}>
          {users()?.map((user) => (
            <li class={listItemStyle}>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </li>
          ))}
        </ul>
      </Show>

      <Button onClick={() => users.refetch()}>Refetch</Button>
    </DemoCard>
  );
}

// resource with reactive source
function ResourceWithSourceDemo() {
  const userId = signal(1);

  const user = resource(
    () => userId(),
    async (id) => {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json() as Promise<User>;
    },
  );

  return (
    <DemoCard title="resource - Reactive Source">
      <div class={buttonRowStyle}>
        <Button onClick={() => userId.set(1)}>User 1</Button>
        <Button onClick={() => userId.set(2)}>User 2</Button>
        <Button onClick={() => userId.set(3)}>User 3</Button>
      </div>

      <p>
        Selected user ID: <strong>{userId}</strong>
      </p>

      <div class={resultBoxStyle}>
        <Show when={user.loading()}>
          <div class={loadingStyle}>Loading user {userId}...</div>
        </Show>

        <Show when={!user.loading() && user()}>
          <div>
            <p>
              <strong>Name:</strong> {user()?.name}
            </p>
            <p>
              <strong>Email:</strong> {user()?.email}
            </p>
            <p>
              <strong>Bio:</strong> {user()?.bio || "No bio"}
            </p>
          </div>
        </Show>
      </div>

      <p class={noteStyle}>Resource automatically refetches when source signal changes.</p>
    </DemoCard>
  );
}

// Loading + Errored, the two boundaries Solid 2.0 ships
function LoadingBoundaryDemo() {
  const fetchId = signal(0);

  const slowData = resource(
    () => fetchId(),
    async () => {
      if (fetchId() === 0) return null;
      const res = await fetch("/api/slow");
      return res.json();
    },
  );

  return (
    <DemoCard title="Loading + Errored - Resource State Rendering">
      <Button onClick={() => fetchId.update((id) => id + 1)}>Fetch Slow Data</Button>

      <div class={resultBoxStyle}>
        <Loading fallback={<div class={loadingStyle}>Waiting for slow response...</div>}>
          <Errored fallback={(err) => <div class={errorStyle}>Error: {() => err().message}</div>}>
            <Show when={() => slowData() !== null} fallback={<p>Click button to fetch</p>}>
              <div class={successStyle}>Response: {() => JSON.stringify(slowData())}</div>
            </Show>
          </Errored>
        </Loading>
      </div>

      <p class={noteStyle}>
        Reading a resource throws before it settles and throws the error after it fails, so the two
        boundaries ARE the three states.
      </p>
    </DemoCard>
  );
}

// Error handling
function ErrorResourceDemo() {
  const shouldFetch = signal(false);

  const errorData = resource(
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
      <Button onClick={() => shouldFetch.set(true)}>Fetch (will fail)</Button>

      <div class={resultBoxStyle}>
        <Show when={errorData.loading()}>
          <div class={loadingStyle}>Fetching...</div>
        </Show>

        <Show when={errorData.error()}>
          <div class={errorStyle}>
            <strong>Error caught:</strong>
            <p>{errorData.error()?.message}</p>
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
  const counter = signal(0);

  const data = resource(
    () => null,
    async () => {
      const res = await fetch("/api/users");
      return res.json() as Promise<User[]>;
    },
  );

  const handleMutate = () => {
    // Optimistically update the data
    data.mutate([{ id: 999, name: "Optimistic User", email: "optimistic@example.com" }]);
    counter.update((c) => c + 1);
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
        <Show when={data.loading()}>
          <div class={loadingStyle}>Loading...</div>
        </Show>

        <Show when={!data.loading() && data()}>
          <ul class={compactListStyle}>
            {data()
              ?.slice(0, 3)
              .map((user) => (
                <li>{user.name}</li>
              ))}
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

const controlsStyle = css`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;
