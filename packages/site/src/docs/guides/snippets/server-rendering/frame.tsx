import { type Child, type Incoming, createSignal } from "@barqjs/core";
import { dynamic } from "@barqjs/web";

// The page's own component for each comment: its state survives an update.
function Comment(props: { cid: number; children: Child }) {
  const [open, setOpen] = createSignal(true);
  return (
    <section data-cid={props.cid}>
      <button type="button" onClick={() => setOpen((was) => !was)}>
        {() => (open() ? "collapse" : "expand")}
      </button>
      <div hidden={() => !open()}>{props.children}</div>
    </section>
  );
}

export default function StoryPage(props: { story: () => unknown }) {
  const Story = dynamic(() => props.story as (props: Record<string, unknown>) => Node);
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
