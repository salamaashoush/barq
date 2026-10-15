/**
 * `/start` — server functions as an application calls them, with Solid 2.0's
 * async primitives around them.
 *
 * The list is an async memo over a GET server function: rendered on the server
 * by an in-process call, refetched in the browser over the wire. Adding a note
 * is an `action` that shows an optimistic row at once and refreshes the list
 * when the server has answered.
 */

import {
  Errored,
  For,
  Loading,
  action,
  createMemo,
  createOptimistic,
  createSignal,
  isPending,
  refresh,
} from "@barqjs/core";
import { css } from "@barqjs/css";
import { createFileRoute } from "@barqjs/router";
import { ServerFnError } from "@barqjs/start/client";

import { describeCall, neverAnswers } from "../data/calls.ts";
import { type Note, addNote, attach, countdown, exportCsv, listNotes } from "../data/notes.ts";
import { Button, DemoCard, DemoSection } from "../demos/shared";
import { renderedOn } from "../where.ts";

function NotesDemo() {
  const notes = createMemo(async () => listNotes());
  // Guesses, shown while an action is in flight and dropped when it settles,
  // by which time the refreshed list holds the real row.
  const [guesses, setGuesses] = createOptimistic<readonly Note[]>([]);
  const [draft, setDraft] = createSignal("");
  const [failure, setFailure] = createSignal("");

  const add = action(function* (text: string) {
    setGuesses((current) => [
      ...current,
      { id: -current.length - 1, text, by: "…", at: new Date() },
    ]);
    try {
      yield addNote({ data: { text } });
      setFailure("");
    } catch {
      setFailure("the server refused that note");
    }
    void refresh(notes);
  });

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    const text = draft();
    setDraft("");
    void add(text);
  };

  return (
    <DemoCard title="GET read, validated POST, optimistic action">
      <form class={rowStyle} onSubmit={submit}>
        <input
          id="note-text"
          class={inputStyle}
          placeholder="a note"
          value={draft()}
          onInput={(event: Event) => setDraft((event.target as HTMLInputElement).value)}
        />
        <button type="submit" id="note-add" class={submitStyle}>
          add
        </button>
      </form>
      <Errored fallback={(error: () => Error) => <p class={errorStyle}>{() => error().message}</p>}>
        <Loading fallback={<p>loading notes…</p>}>
          <ul id="notes" class={{ [listStyle]: true, stale: isPending(notes) }}>
            <For each={() => [...notes(), ...guesses()]}>
              {(note: Note) => (
                <li class={{ guess: note.id < 0 }} data-id={note.id}>
                  {note.text} <small>— {note.by}</small>
                </li>
              )}
            </For>
          </ul>
        </Loading>
      </Errored>
      <p id="note-failure" class={errorStyle}>
        {() => failure()}
      </p>
    </DemoCard>
  );
}

function UploadDemo() {
  const [answer, setAnswer] = createSignal("—");
  const upload = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const sent = await attach(form);
    setAnswer(`${sent.name}, ${sent.size} bytes, "${sent.caption}": ${sent.firstLine}`);
  };
  return (
    <DemoCard title="A form with a file in it">
      <form id="upload" class={rowStyle} onSubmit={(event: SubmitEvent) => void upload(event)}>
        <input type="file" name="file" id="upload-file" />
        <input name="caption" id="upload-caption" class={inputStyle} placeholder="caption" />
        <button type="submit" id="upload-send" class={submitStyle}>
          send
        </button>
      </form>
      <p id="upload-answer">{() => answer()}</p>
    </DemoCard>
  );
}

function StreamDemo() {
  const [ticks, setTicks] = createSignal<readonly string[]>([]);
  const run = async (): Promise<void> => {
    setTicks([]);
    for await (const tick of await countdown({ data: { from: 4 } })) {
      setTicks((current) => [...current, `${tick.left} @ ${tick.at.toISOString().slice(17, 23)}`]);
    }
  };
  const download = async (): Promise<void> => {
    const response = await exportCsv();
    setTicks([
      `csv: ${response.headers.get("content-type")}`,
      ...(await response.text()).split("\n"),
    ]);
  };
  return (
    <DemoCard title="A stream, and a raw response">
      <div class={rowStyle}>
        <Button onClick={() => void run()}>count down</Button>
        <Button variant="secondary" onClick={() => void download()}>
          export csv
        </Button>
      </div>
      <ol id="ticks">
        <For each={ticks}>{(tick: string) => <li>{tick}</li>}</For>
      </ol>
    </DemoCard>
  );
}

function CallDemo() {
  const [lines, setLines] = createSignal<readonly string[]>([]);
  const describe = async (): Promise<void> => {
    const call = await describeCall();
    setLines([
      `${call.method} ${call.id}`,
      `middleware: ${call.trace}`,
      `left the browser at ${call.sentAt?.toISOString().slice(11, 23) ?? "?"}`,
    ]);
  };
  const refused = async (): Promise<void> => {
    try {
      await neverAnswers();
      setLines(["answered, which it should not have"]);
    } catch (error) {
      setLines([`refused: ${error instanceof ServerFnError ? error.status : String(error)}`]);
    }
  };
  return (
    <DemoCard title="What a call knows, and a middleware that forgot next()">
      <div class={rowStyle}>
        <Button onClick={() => void describe()}>describe the call</Button>
        <Button variant="secondary" onClick={() => void refused()}>
          call past a broken middleware
        </Button>
      </div>
      <ul id="call-lines">
        <For each={lines}>{(line: string) => <li>{line}</li>}</For>
      </ul>
    </DemoCard>
  );
}

function Start() {
  return (
    <section>
      <h2>Server functions</h2>
      <p id="rendered-on">This page was last rendered in {() => renderedOn()}.</p>
      <DemoSection>
        <NotesDemo />
        <UploadDemo />
        <StreamDemo />
        <CallDemo />
      </DemoSection>
    </section>
  );
}

export const Route = createFileRoute("/start")({
  component: Start,
});

const rowStyle = css`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
`;

const inputStyle = css`
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #0f172a;
  color: inherit;
`;

const submitStyle = css`
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: #3b82f6;
  color: white;
`;

const listStyle = css`
  list-style: none;
  display: grid;
  gap: 4px;
  & .guess {
    opacity: 0.5;
  }
  &.stale {
    opacity: 0.7;
  }
`;

const errorStyle = css`
  color: #f87171;
`;
