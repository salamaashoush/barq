/**
 * The server functions `/frames` calls. `getStory`'s handler returns a
 * component, which makes its answer a frame: the story is rendered on the
 * server, and the browser receives its markup and never this code. Each
 * comment is a slot the page fills with a component of its own, and each
 * comment's like button is the server's markup with the page's behaviour
 * bound to it: a binding slot.
 */

import { type Child, Loading, createMemo } from "@barqjs/core";
import { useHead } from "@barqjs/web";
import { type BindingSlot, type Slot, createServerFn, invalidateFrames } from "@barqjs/start";

interface Story {
  readonly title: string;
  revision: number;
  readonly comments: { readonly id: number; text: string }[];
}

/** In memory: the demo has no database. */
const STORIES = new Map<string, Story>([
  [
    "1",
    {
      title: "Signals all the way down",
      revision: 1,
      comments: [
        { id: 1, text: "The engine is Solid's." },
        { id: 2, text: "The renderer is barq's." },
      ],
    },
  ],
  [
    "2",
    {
      title: "Markup that knows where it came from",
      revision: 1,
      comments: [{ id: 3, text: "A frame is its markup." }],
    },
  ],
]);

const storyOf = (id: string): Story => STORIES.get(id) ?? STORIES.get("1")!;

/**
 * A stylesheet the region needs, as a `data:` URL so the demo ships no file:
 * a frame answer that names one is applied only once it has loaded.
 */
const REGION_SHEET =
  "data:text/css," +
  encodeURIComponent(
    "barq-frame article.story { border-left: 3px solid #60a5fa; padding-left: 12px }",
  );

/** What the page binds to a comment's like button. */
export interface Like {
  readonly liked: boolean;
  readonly label: string;
  readonly toggle: () => void;
}

export const getStory = createServerFn({ method: "GET" })
  .validator((input: { readonly id: string }) => ({ id: String(input.id) }))
  .handler(({ data }) => {
    const story = storyOf(data.id);
    return (props: {
      readonly comment: Slot<{ cid: number }>;
      readonly like: BindingSlot<{ cid: number }, Like>;
      readonly children?: Child;
    }) => {
      useHead({ tag: "link", props: { rel: "stylesheet", href: REGION_SHEET } });
      return (
        <article class="story" id="story" data-story={data.id}>
          <h2 id="story-title">{story.title}</h2>
          <p id="story-revision">revision {story.revision}</p>
          <ul id="story-comments">
            {story.comments.map((comment) => {
              const like = props.like({ $key: comment.id, cid: comment.id });
              return (
                <li>
                  <props.comment $key={comment.id} cid={comment.id}>
                    <p class="comment-text">{comment.text}</p>
                  </props.comment>
                  <button
                    type="button"
                    id={`like-${comment.id}`}
                    class={{ like: true, liked: like.liked }}
                    aria-pressed={like.liked}
                    onClick={like.toggle}
                  >
                    {like.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <footer>{props.children}</footer>
        </article>
      );
    };
  });

/**
 * Edit a story on the server. It says the story's frame changed, so its answer
 * carries the region again beside its value: one request, and the page shows
 * the edit where the story stands.
 */
export const reviseStory = createServerFn({ method: "POST" })
  .validator((input: { readonly id: string }) => ({ id: String(input.id) }))
  .handler(({ data }) => {
    const story = storyOf(data.id);
    story.revision++;
    for (const comment of story.comments)
      comment.text = `${comment.text.replace(/ \(r\d+\)$/, "")} (r${story.revision})`;
    invalidateFrames(getStory);
    return story.revision;
  });

/** The live board's lines, and every connection listening to them. */
let lines: readonly string[] = ["the board is open"];
const listening = new Set<() => void>();

/**
 * A standing source: every reader starts from the board as it stands, then
 * hears each line posted, until its connection ends.
 */
function board(signal: AbortSignal | undefined): AsyncIterable<readonly string[]> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<readonly string[]> {
      let owed = true;
      let wake: (() => void) | null = null;
      const heard = (): void => {
        owed = true;
        wake?.();
      };
      listening.add(heard);
      const stop = (): void => {
        listening.delete(heard);
        wake?.();
      };
      signal?.addEventListener("abort", stop, { once: true });
      return {
        async next(): Promise<IteratorResult<readonly string[]>> {
          while (!owed && listening.has(heard))
            await new Promise<void>((resolve) => (wake = resolve));
          if (!listening.has(heard)) return { done: true, value: undefined };
          owed = false;
          return { done: false, value: lines };
        },
        async return(): Promise<IteratorResult<readonly string[]>> {
          stop();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/** A live frame: the board, rendered again on the server for each line posted. */
export const liveBoard = createServerFn({ method: "GET" }).handler(({ signal }) => {
  const feed = board(signal);
  return () => {
    const latest = createMemo(() => feed);
    return (
      <Loading fallback={<p>opening the board…</p>}>
        <ul id="live-board">
          {latest().map((line) => (
            <li>{line}</li>
          ))}
        </ul>
      </Loading>
    );
  };
});

/** Post a line; every page showing the board receives it over its connection. */
export const postLine = createServerFn({ method: "POST" })
  .validator((input: { readonly text: string }) => {
    const text = input.text.trim();
    if (text === "" || text.length > 120) throw new Error("a line is 1 to 120 characters");
    return { text };
  })
  .handler(({ data }) => {
    lines = [...lines, data.text];
    for (const heard of listening) heard();
    return lines.length;
  });
