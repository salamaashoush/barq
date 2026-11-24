import { type Child, type Incoming, createSignal } from "@barqjs/core";
import { dynamic } from "@barqjs/web";

interface CommentProps {
  cid: number;
  children: Child;
}

// The page's own component for each comment: its state survives an update.
function Comment(props: CommentProps) {
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

export interface StoryPageProps {
  story: () => unknown;
}

interface CommentSlotProps {
  cid: number;
  children: Child;
}

export default function StoryPage(props: StoryPageProps) {
  const Story = dynamic(() => props.story as (props: Record<string, unknown>) => Node);
  return (
    <Story
      comment={(slot: Incoming<CommentSlotProps>) => (
        <Comment cid={slot.cid()}>{slot.children}</Comment>
      )}
    >
      <p>shared from the page</p>
    </Story>
  );
}
