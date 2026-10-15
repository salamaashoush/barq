/**
 * Async Demo
 * Tests: async createMemo, Loading, Errored, Reveal, isPending, latest,
 * refresh, affects, createOptimistic, action
 *
 * NOTE: an async memo is read like any other accessor, with an explicit ().
 * The read throws until the first answer lands, and `<Loading>` catches it.
 */

import {
  Errored,
  For,
  Loading,
  Reveal,
  Show,
  action,
  affects,
  createMemo,
  createOptimistic,
  createSignal,
  isPending,
  latest,
  refresh,
  type Incoming,
} from "@barqjs/core";
import { css } from "@barqjs/css";
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
      <AsyncMemoDemo />
      <ReactiveSourceDemo />
      <LoadingBoundaryDemo />
      <LoadingValueDemo />
      <OptimisticLaneDemo />
      <RevealOrderDemo />
      <ErrorHandlingDemo />
      <RefetchDemo />
    </DemoSection>
  );
}

/**
 * A8 — commit #0. The skeleton is the VALUE, not a boundary's fallback.
 *
 * During the FIRST fetch this memo reads as settled: `isPending` is false,
 * nothing suspends, and the `<Loading>` above it never shows its fallback. The
 * placeholder carries its own provenance (`skeleton: true`) rather than
 * impersonating a real record. Once the first answer lands the loading value
 * leaves the lineage and a refetch is an ordinary revalidation — stale row
 * shown, `isPending` true — which is the `stale` class appearing.
 */
type Row = { name: string; skeleton?: boolean };

function LoadingValueDemo() {
  const [generation, setGeneration] = createSignal(0);

  const row = createMemo<Row>(
    async () => {
      const res = await fetch(`/api/staggered?name=record&delay=1200&run=${generation()}`);
      return (await res.json()) as Row;
    },
    { loadingValue: { name: "————————", skeleton: true } },
  );

  return (
    <DemoCard title="loadingValue - commit #0">
      <div class={controlsStyle}>
        <Button onClick={() => setGeneration((n) => n + 1)}>Refetch</Button>
      </div>

      <div class={resultBoxStyle}>
        <Loading fallback={<div class={loadingStyle}>this fallback must never appear</div>}>
          <h4
            class={{ [staleClass]: true, stale: isPending(row) }}
            data-testid="commit-zero"
            data-skeleton={() => String(row().skeleton === true)}
          >
            {() => row().name}
          </h4>
        </Loading>
      </div>

      <p class={noteStyle}>
        The canonical guard is `row().skeleton || isPending(row)` — two terms because the two states
        are disjoint. First load is answered by the value; a refetch is answered by the pending
        channel.
      </p>
    </DemoCard>
  );
}

/**
 * A5's lane, in the shape the reference's own docs use:
 * `class={{ stale: isPending(value) }}` beside the value the guess covers.
 *
 * `isPending` calls its argument, so the tracked read happens inside the callee
 * and the binding is live all the same (A5 (f)).
 */
function OptimisticLaneDemo() {
  const [saved, setSaved] = createSignal("Untitled");
  const [title, setTitle] = createOptimistic(() => saved());

  const rename = action(function* (next: string) {
    affects(saved); // the title reads as pending until the action settles
    setTitle(next); // the guess, shown at once
    const answer = (yield fetch(`/api/staggered?name=${next}&delay=1200`).then((r) =>
      r.json(),
    )) as {
      name: string;
    };
    // The answer, written to the signal the guess covers. It is held with the
    // action and lands when the action settles, as the guess is dropped.
    setSaved(`${answer.name} (saved)`);
  });

  return (
    <DemoCard title="createOptimistic + action - the guess and what it covers">
      <div class={controlsStyle}>
        <Button onClick={() => void rename(`Draft ${Math.floor(Math.random() * 90) + 10}`)}>
          Rename
        </Button>
      </div>

      <div class={resultBoxStyle}>
        <h4 class={{ [staleClass]: true, stale: isPending(title) }} data-testid="lane-title">
          {() => title()}
        </h4>
        <p class={noteStyle}>
          authoritative: <code data-testid="lane-latest">{() => saved()}</code>
        </p>
      </div>

      <p class={noteStyle}>
        While the action is in flight the heading shows the guess and is marked stale; the signal
        underneath still holds the value that is really committed. When the action settles the guess
        is dropped onto a value that is already correct — nothing is rolled back.
      </p>
    </DemoCard>
  );
}

/**
 * A nested `<Reveal>` group (A6). The inner group is ONE slot of the outer, so
 * `posts` cannot appear before `header` under `sequential` however fast it
 * lands — and under `together` nothing shows until `header` and the group's
 * first slot are both ready.
 *
 * The delays are deliberately in the wrong order: `posts` is the fastest and is
 * registered second, which is the only arrangement under which the three orders
 * are distinguishable from one another.
 */
/** The three `Reveal` orders, named once so the group and its buttons agree. */
type RevealOrder = "sequential" | "together" | "natural";

function RevealOrderDemo() {
  const [run, setRun] = createSignal(0);
  const [order, setOrder] = createSignal<RevealOrder>("sequential");

  return (
    <DemoCard title="Reveal - nested ordering">
      <div class={controlsStyle}>
        <Button onClick={() => setRun((n) => n + 1)}>Load</Button>
        <For each={() => ["sequential", "together", "natural"] as RevealOrder[]}>
          {(mode: RevealOrder) => (
            <Button
              onClick={() => {
                setOrder(mode);
                setRun((n) => n + 1);
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

function Slot(props: Incoming<{ name: string; delay: number; run: number }>) {
  // `run` is in the URL: without it the second press replays Chrome's HTTP
  // cache and every slot settles in the same microtask, which reads exactly
  // like a group that reveals all at once.
  const data = createMemo(async () => {
    const res = await fetch(
      `/api/staggered?name=${props.name()}&delay=${props.delay()}&run=${props.run()}`,
    );
    return (await res.json()) as { name: string; at: number };
  });

  return (
    <Loading
      fallback={
        <div class={loadingStyle} data-slot={props.name} data-state="pending">
          {props.name}…
        </div>
      }
    >
      <div class={successStyle} data-slot={props.name} data-state="ready">
        {() => `${data().name} ready`}
      </div>
    </Loading>
  );
}

// An async memo under the two boundaries
function AsyncMemoDemo() {
  const users = createMemo(async () => {
    const res = await fetch("/api/users");
    if (!res.ok) throw new Error("Failed to fetch users");
    return (await res.json()) as User[];
  });

  // A bare refresh() is a quiet re-ask. Declared inside an action, `affects`
  // marks the memo pending until the answer the refresh asked for lands.
  const reload = action(function* () {
    affects(users);
    refresh(users);
  });

  return (
    <DemoCard title="createMemo - Async">
      <Errored
        fallback={(err: () => Error) => <div class={errorStyle}>Error: {() => err().message}</div>}
      >
        <Loading fallback={<div class={loadingStyle}>Loading users...</div>}>
          <ul class={{ [listStyle]: true, [staleClass]: true, stale: isPending(users) }}>
            <For each={users}>
              {(user: User) => (
                <li class={listItemStyle}>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </li>
              )}
            </For>
          </ul>
        </Loading>
      </Errored>

      <Button onClick={() => void reload()}>Refetch</Button>
    </DemoCard>
  );
}

// An async memo that reads a signal
function ReactiveSourceDemo() {
  const [userId, setUserId] = createSignal(1);

  const user = createMemo(async () => {
    const res = await fetch(`/api/users/${userId()}`);
    if (!res.ok) throw new Error("Failed to fetch user");
    return (await res.json()) as User;
  });

  return (
    <DemoCard title="createMemo - Reactive Source">
      <div class={buttonRowStyle}>
        <Button onClick={() => setUserId(1)}>User 1</Button>
        <Button onClick={() => setUserId(2)}>User 2</Button>
        <Button onClick={() => setUserId(3)}>User 3</Button>
      </div>

      <p>
        Selected user ID: <strong>{() => latest(userId)}</strong>
      </p>

      <div class={resultBoxStyle}>
        <Loading fallback={<div class={loadingStyle}>Loading user {() => latest(userId)}...</div>}>
          <div class={{ [staleClass]: true, stale: isPending(user) }}>
            <p>
              <strong>Name:</strong> {() => user().name}
            </p>
            <p>
              <strong>Email:</strong> {() => user().email}
            </p>
            <p>
              <strong>Bio:</strong> {() => user().bio || "No bio"}
            </p>
          </div>
        </Loading>
      </div>

      <p class={noteStyle}>
        The memo refetches when the signal it reads changes. The previous user stays on screen,
        marked stale by `isPending(user)`, and `latest(userId)` shows the selection that is still in
        flight.
      </p>
    </DemoCard>
  );
}

// Loading + Errored, the two boundaries Solid 2.0 ships
function LoadingBoundaryDemo() {
  const [fetchId, setFetchId] = createSignal(0);

  const slowData = createMemo<{ message: string } | null>(() => {
    if (fetchId() === 0) return null;
    return fetch("/api/slow").then((res) => res.json());
  });

  return (
    <DemoCard title="Loading + Errored - Async State Rendering">
      <Button onClick={() => setFetchId((id) => id + 1)}>Fetch Slow Data</Button>

      <div class={resultBoxStyle}>
        <Show when={fetchId} fallback={<p>Click button to fetch</p>}>
          <Loading
            on={fetchId}
            fallback={<div class={loadingStyle}>Waiting for slow response...</div>}
          >
            <Errored
              fallback={(err: () => Error) => (
                <div class={errorStyle}>Error: {() => err().message}</div>
              )}
            >
              <div class={successStyle}>Response: {() => JSON.stringify(slowData())}</div>
            </Errored>
          </Loading>
        </Show>
      </div>

      <p class={noteStyle}>
        Reading an async memo throws before it settles and throws the error after it fails, so the
        two boundaries ARE the three states. `on` re-arms the fallback for each new fetch; without
        it the settled content stays up while the next answer is in flight.
      </p>
    </DemoCard>
  );
}

// Error handling
function ErrorHandlingDemo() {
  const [shouldFetch, setShouldFetch] = createSignal(false);

  const errorData = createMemo<unknown>(() => {
    if (!shouldFetch()) return null;
    return fetch("/api/error").then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
  });

  return (
    <DemoCard title="Errored - Async Error Handling">
      <Button onClick={() => setShouldFetch(true)}>Fetch (will fail)</Button>

      <div class={resultBoxStyle}>
        <Show when={shouldFetch} fallback={<p>Click button to trigger an error</p>}>
          <Loading fallback={<div class={loadingStyle}>Fetching...</div>}>
            <Errored
              fallback={(err: () => Error, reset: () => void) => (
                <div class={errorStyle}>
                  <strong>Error caught:</strong>
                  <p>{() => err().message}</p>
                  <Button onClick={reset}>Retry</Button>
                </div>
              )}
            >
              <div class={successStyle}>Response: {() => JSON.stringify(errorData())}</div>
            </Errored>
          </Loading>
        </Show>
      </div>

      <p class={noteStyle}>
        A rejected async memo throws at its read. `Errored` catches it and hands the fallback the
        error and a `reset` that asks again.
      </p>
    </DemoCard>
  );
}

// Manual refetch and a local write
function RefetchDemo() {
  const [counter, setCounter] = createSignal(0);

  const [data, setData] = createSignal(async () => {
    const res = await fetch("/api/users");
    return (await res.json()) as User[];
  });

  const handleWrite = () => {
    setData([{ id: 999, name: "Local User", email: "local@example.com" }]);
    setCounter((c) => c + 1);
  };

  const reload = action(function* () {
    affects(data);
    refresh(data);
  });

  return (
    <DemoCard title="refresh & a writable memo">
      <p>
        Write count: <strong>{counter}</strong>
      </p>

      <div class={buttonRowStyle}>
        <Button onClick={() => void reload()}>Refetch</Button>
        <Button onClick={handleWrite}>Write Locally</Button>
      </div>

      <div class={resultBoxStyle}>
        <Loading fallback={<div class={loadingStyle}>Loading...</div>}>
          <ul class={{ [compactListStyle]: true, [staleClass]: true, stale: isPending(data) }}>
            <For each={() => data().slice(0, 3)}>{(user: User) => <li>{user.name}</li>}</For>
          </ul>
        </Loading>
      </div>

      <p class={noteStyle}>
        `createSignal(fn)` is a memo with a setter: a write replaces the fetched value without
        asking again. `refresh` asks again, and `affects` marks the list stale until the answer
        lands.
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

const staleClass = css`
  &.stale {
    opacity: 0.55;
    font-style: italic;
  }
`;

const controlsStyle = css`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;
