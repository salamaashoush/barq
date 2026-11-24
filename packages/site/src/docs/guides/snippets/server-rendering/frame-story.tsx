import { type Child } from "@barqjs/core";
import { type Slot, createServerFn } from "@barqjs/start";

interface Story {
  title: string;
  comments: StoryComment[];
}

interface StoryComment {
  id: number;
  text: string;
}

const STORIES: Record<string, Story> = {
  "1": { title: "Signals all the way down", comments: [{ id: 1, text: "The engine is Solid's." }] },
};

interface StoryQuery {
  id: string;
}

interface StoryFrameProps {
  comment: Slot<CommentSlot>;
  children?: Child;
}

interface CommentSlot {
  cid: number;
}

// The handler returns a component, so the answer is a frame: its markup, never this code.
export const getStory = createServerFn({ method: "GET" })
  .validator((input: StoryQuery) => input)
  .handler(({ data }) => {
    const story = STORIES[data.id] ?? { title: "missing", comments: [] };
    return (props: StoryFrameProps) => (
      <article>
        <h2>{story.title}</h2>
        {story.comments.map((c) => (
          <props.comment $key={c.id} cid={c.id}>
            <p>{c.text}</p>
          </props.comment>
        ))}
        <footer>{props.children}</footer>
      </article>
    );
  });

export default getStory;
