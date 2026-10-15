/**
 * The server functions `/start` calls, one for each shape a call can take: a
 * cached read over GET, a validated write, a form with a file in it, a stream,
 * and a raw response.
 *
 * Every one carries `requireSession`, whose `next({ context })` types
 * `context.session` in each handler with no annotation here.
 */

import { createServerFn, setResponseHeader } from "@barqjs/start";

import { requireSession } from "../auth.ts";

export interface Note {
  readonly id: number;
  readonly text: string;
  readonly by: string;
  readonly at: Date;
}

/** One list per signed-in user, in memory: the demo has no database. */
const NOTES = new Map<string, Note[]>();
let nextId = 1;

const notesOf = (user: string): Note[] => {
  let list = NOTES.get(user);
  if (list === undefined) {
    list = [];
    NOTES.set(user, list);
  }
  return list;
};

/**
 * A READ, so it is a GET: the browser may reuse the answer for a few seconds,
 * and `private` because the answer is this user's alone.
 */
export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(({ context }): readonly Note[] => {
    setResponseHeader("cache-control", "private, max-age=0, must-revalidate");
    return notesOf(context.session.user);
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator((input: { readonly text: string }) => {
    const text = input.text.trim();
    if (text === "" || text.length > 200) throw new Error("a note is 1 to 200 characters");
    return { text };
  })
  .handler(async ({ data, context }): Promise<Note> => {
    // Slow enough to see the optimistic row stand in for the real one.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const note = { id: nextId++, text: data.text, by: context.session.user, at: new Date() };
    notesOf(context.session.user).push(note);
    return note;
  });

/** A form, file and all: the handler is handed the `FormData` itself. */
export const attach = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("expected a form");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("expected a file");
    const caption = input.get("caption");
    return { file, caption: typeof caption === "string" ? caption : "" };
  })
  .handler(async ({ data }) => ({
    name: data.file.name,
    size: data.file.size,
    caption: data.caption,
    firstLine: (await data.file.text()).split("\n")[0] ?? "",
  }));

/** Values over time, over GET: the caller reads them as they arrive. */
export const countdown = createServerFn({ method: "GET" })
  .validator((input: { readonly from: number }) => ({
    from: Math.min(10, Math.max(1, input.from)),
  }))
  .handler(async function* ({ data, signal }) {
    for (let left = data.from; left >= 0; left--) {
      if (signal.aborted) return;
      yield { left, at: new Date() };
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  });

/** An answer that is not a value: the caller receives the `Response` itself. */
export const exportCsv = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(({ context }) => {
    const rows = notesOf(context.session.user).map(
      (note) => `${note.id},${JSON.stringify(note.text)},${note.at.toISOString()}`,
    );
    return new Response(["id,text,at", ...rows].join("\n"), {
      headers: { "content-type": "text/csv; charset=utf-8" },
    });
  });
