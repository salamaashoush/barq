/**
 * `/frames` — a story rendered on the server as a frame.
 *
 * The loader calls `getStory`, whose answer is the region, and the page
 * renders it with its own component in each comment's slot. Choosing another
 * story mounts that story's region. Revising one is a mutation whose answer
 * carries the story's region beside its value, applied where the region
 * stands: a comment you collapsed stays collapsed, and nothing else on the
 * page is built again.
 */

import { type Child, type Incoming, createSignal, dynamic } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Link, type RouteProps, createFileRoute, useLocation } from "@barqjs/router";

import { getStory, reviseStory } from "../data/stories.tsx";
import { DemoCard, DemoSection } from "../demos/shared";

function Comment(props: Incoming<{ cid: number; children: Child }>) {
  const [open, setOpen] = createSignal(true);
  return (
    <section class={commentStyle} data-cid={props.cid()}>
      <button type="button" class="toggle" onClick={() => setOpen((was) => !was)}>
        {() => (open() ? "collapse" : "expand")}
      </button>
      <div hidden={() => !open()}>{props.children}</div>
    </section>
  );
}

function Frames(props: RouteProps) {
  const location = useLocation();
  const View = dynamic(() => props.data() as (props: Record<string, unknown>) => Node);
  const [revising, setRevising] = createSignal(false);
  const revise = async (): Promise<void> => {
    setRevising(true);
    await reviseStory({ data: { id: storyIn(new URLSearchParams(location().search)) } });
    setRevising(false);
  };
  return (
    <DemoSection>
      <DemoCard title="A server component, updated in place">
        <nav class={navStyle}>
          <Link to="/frames" search={{ story: "1" }} id="story-one">
            story one
          </Link>
          <Link to="/frames" search={{ story: "2" }} id="story-two">
            story two
          </Link>
          <button type="button" id="revise" onClick={() => void revise()} disabled={revising}>
            revise on the server
          </button>
        </nav>
        <View
          comment={(slot: Incoming<{ cid: number; children: Child }>) => (
            <Comment cid={slot.cid()}>{slot.children}</Comment>
          )}
        >
          <p class={shareStyle}>shared from the page</p>
        </View>
      </DemoCard>
    </DemoSection>
  );
}

/** The story the page shows, `?story=`, one when it names none. */
const storyIn = (search: URLSearchParams): string => search.get("story") ?? "1";

export const Route = createFileRoute<unknown, Record<string, string>, { story: string }>("/frames")(
  {
    loaderDeps: ({ search }) => ({ story: storyIn(search) }),
    loader: ({ deps }) => getStory({ data: { id: deps.story } }),
    component: Frames,
  },
);

const navStyle = css`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
`;

const commentStyle = css`
  background: #1e293b;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 6px 0;
`;

const shareStyle = css`
  color: #94a3b8;
  font-size: 14px;
`;
