import { type Child, type Incoming, createSignal, dynamic } from "@barqjs/core";
import { type Slot, createServerFn } from "@barqjs/start";

const STORIES: Record<string, { title: string; comments: { id: number; text: string }[] }> = {
  "1": { title: "Signals all the way down", comments: [{ id: 1, text: "The engine is Solid's." }] },
};

// The handler returns a component, so the answer is a frame: its markup, never this code.
export const getStory = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => {
    const story = STORIES[data.id] ?? { title: "missing", comments: [] };
    return (props: { comment: Slot<{ cid: number }>; children?: Child }) => (
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

// The page's own component for each comment: its state survives an update.
function Comment(props: Incoming<{ cid: number; children: Child }>) {
  const [open, setOpen] = createSignal(true);
  return (
    <section data-cid={props.cid()}>
      <button type="button" onClick={() => setOpen((was) => !was)}>
        {() => (open() ? "collapse" : "expand")}
      </button>
      <div hidden={() => !open()}>{props.children}</div>
    </section>
  );
}

export default function StoryPage(props: { story: () => unknown }) {
  const Story = dynamic(() => props.story() as (props: Record<string, unknown>) => Node);
  return (
    <Story
      comment={(slot: Incoming<{ cid: number; children: Child }>) => (
        <Comment cid={slot.cid()}>{slot.children}</Comment>
      )}
    >
      <p>shared from the page</p>
    </Story>
  );
}
