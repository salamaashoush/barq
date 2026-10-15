import { css } from "@barqjs/css";
import { Eye } from "@barqjs/lucide/icons/eye";
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

export default function BubbleGroupDemo() {
  return (
    <div class={frame}>
      <Bubble variant="muted">
        <BubbleContent>Can you tell me what's the issue?</BubbleContent>
      </Bubble>
      <BubbleGroup>
        <Bubble align="end">
          <BubbleContent>You tell me!</BubbleContent>
        </Bubble>
        <Bubble align="end">
          <BubbleContent>It worked yesterday. You broke it!</BubbleContent>
        </Bubble>
        <Bubble align="end">
          <BubbleContent>Find the bug and fix it.</BubbleContent>
          <BubbleReactions role="img" aria-label="Reactions: eyes" align="start">
            <Eye size={14} />
          </BubbleReactions>
        </Bubble>
      </BubbleGroup>
      <Bubble variant="muted">
        <BubbleContent>
          Want me to diff yesterday's you against today's you? It's a bit embarrassing.
        </BubbleContent>
      </Bubble>
    </div>
  );
}
