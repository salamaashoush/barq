/**
 * The server functions `/frames` calls. `getStory`'s handler returns a
 * component, which makes its answer a frame: the story is rendered on the
 * server, and the browser receives its markup and never this code. Each
 * comment is a slot the page fills with a component of its own.
 */

import { type Child, useHead } from "@barqjs/core";
import { type Slot, createServerFn, invalidateFrames } from "@barqjs/start";

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

export const getStory = createServerFn({ method: "GET" })
  .validator((input: { readonly id: string }) => ({ id: String(input.id) }))
  .handler(({ data }) => {
    const story = storyOf(data.id);
    return (props: { readonly comment: Slot<{ cid: number }>; readonly children?: Child }) => {
      useHead({ tag: "link", props: { rel: "stylesheet", href: REGION_SHEET } });
      return (
        <article class="story" id="story" data-story={data.id}>
          <h2 id="story-title">{story.title}</h2>
          <p id="story-revision">revision {story.revision}</p>
          <ul id="story-comments">
            {story.comments.map((comment) => (
              <li>
                <props.comment $key={comment.id} cid={comment.id}>
                  <p class="comment-text">{comment.text}</p>
                </props.comment>
              </li>
            ))}
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
