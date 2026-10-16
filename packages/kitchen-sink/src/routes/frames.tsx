/**
 * `/frames` — a story rendered on the server as a frame.
 *
 * The loader calls `getStory`, whose answer is the region, and the page
 * renders it with its own component in each comment's slot. Choosing another
 * story mounts that story's region. Revising one is a mutation whose answer
 * carries the story's region beside its value, applied where the region
 * stands: a comment you collapsed stays collapsed, a comment you liked stays
 * liked, and nothing else on the page is built again.
 */

import { type Child, type Incoming, createMemo, createSignal, dynamic } from "@barqjs/core";
import { live } from "@barqjs/start";
import { css } from "@barqjs/css";
import { Link, type RouteProps, createFileRoute, useLocation } from "@barqjs/router";

import { type Like, getStory, liveBoard, postLine, reviseStory } from "../data/stories.tsx";
import { DemoCard, DemoSection } from "../demos/shared";

/** The page's side of a comment's like button: the server's markup, this behaviour. */
function like(): Like {
  const [liked, setLiked] = createSignal(false);
  return {
    get liked() {
      return liked();
    },
    get label() {
      return liked() ? "liked" : "like";
    },
    toggle: () => setLiked((was) => !was),
  };
}

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

/**
 * A live frame: the server renders the board again for each line posted, and
 * this page receives each rendering over one connection, applied in place.
 */
function LiveBoard() {
  const board = createMemo(() => live(liveBoard)());
  const Board = dynamic(() => board() as unknown as (props: Record<string, unknown>) => Node);
  const [text, setText] = createSignal("");
  const post = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const line = text();
    setText("");
    await postLine({ data: { text: line } });
  };
  return (
    <DemoCard title="A live frame">
      <form class={navStyle} onSubmit={(event: SubmitEvent) => void post(event)}>
        <input
          id="line-text"
          value={text()}
          onInput={(event: Event) => setText((event.target as HTMLInputElement).value)}
        />
        <button type="submit" id="line-post">
          post
        </button>
      </form>
      <Board />
    </DemoCard>
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
          like={like}
        >
          <p class={shareStyle}>shared from the page</p>
        </View>
      </DemoCard>
      <LiveBoard />
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
