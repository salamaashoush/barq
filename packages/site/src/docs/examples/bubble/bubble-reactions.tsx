import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Eye } from "@barqjs/lucide/icons/eye";
import { FaceGrinning } from "@barqjs/lucide/icons/face-grinning";
import { PartyPopper } from "@barqjs/lucide/icons/party-popper";
import { Rocket } from "@barqjs/lucide/icons/rocket";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { ThumbsUp } from "@barqjs/lucide/icons/thumbs-up";
import { Bubble, BubbleContent, BubbleReactions, Button } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 12);
  padding-block: calc(var(--spacing) * 12);
`;

export default function BubbleReactionsDemo() {
  const [running, setRunning] = createSignal(false);

  return (
    <div class={frame}>
      <Bubble variant="muted" align="end">
        <BubbleContent>I don't need tests, I know my code works.</BubbleContent>
        <BubbleReactions align="start" role="img" aria-label="Reactions: thumbs up, grinning">
          <ThumbsUp size={14} />
          <FaceGrinning size={14} />
        </BubbleReactions>
      </Bubble>
      <Bubble variant="muted">
        <BubbleContent>
          Bold. Fine I'll add some tests. I'll let you know when they're done.
        </BubbleContent>
        <BubbleReactions role="img" aria-label="Reactions: eyes, rocket, and 2 more">
          <Eye size={14} />
          <Rocket size={14} />
          <span>+2</span>
        </BubbleReactions>
      </Bubble>
      <Bubble variant="default" align="end">
        <BubbleContent>Tests passed on the first try. All 142 of them. Looking good!</BubbleContent>
        <BubbleReactions
          side="top"
          align="start"
          role="img"
          aria-label="Reactions: party popper, sparkles"
        >
          <PartyPopper size={14} />
          <Sparkles size={14} />
        </BubbleReactions>
      </Bubble>
      <Bubble variant="destructive">
        <BubbleContent>Are you sure I can run this command?</BubbleContent>
        <BubbleReactions>
          <Button variant="ghost" size="xs" onPress={() => setRunning(true)}>
            {() => (running() ? "Running command..." : "Yes, run it")}
          </Button>
        </BubbleReactions>
      </Bubble>
    </div>
  );
}
