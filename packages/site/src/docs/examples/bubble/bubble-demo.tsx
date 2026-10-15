import { css } from "@barqjs/css";
import { Eye } from "@barqjs/lucide/icons/eye";
import { Flame } from "@barqjs/lucide/icons/flame";
import { ThumbsUp } from "@barqjs/lucide/icons/thumbs-up";
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

export default function BubbleDemo() {
  return (
    <div class={frame}>
      <Bubble align="end">
        <BubbleContent>Hey there! what's up?</BubbleContent>
      </Bubble>
      <BubbleGroup>
        <Bubble variant="muted">
          <BubbleContent>Hey! Want to see chat bubbles?</BubbleContent>
        </Bubble>
        <Bubble variant="muted">
          <BubbleContent>
            I can group messages, switch sides, and keep the whole thread easy to scan.
          </BubbleContent>
          <BubbleReactions role="img" aria-label="Reaction: thumbs up">
            <ThumbsUp size={14} />
          </BubbleReactions>
        </Bubble>
      </BubbleGroup>
      <Bubble align="end">
        <BubbleContent>Sure. Hit me with your best demo.</BubbleContent>
      </Bubble>
      <Bubble variant="muted">
        <BubbleContent>
          Yes. You are reading a demo that is demoing itself. Very meta. Very on-brand.
        </BubbleContent>
        <BubbleReactions role="img" aria-label="Reactions: thumbs up, fire, eyes, and 2 more">
          <ThumbsUp size={14} />
          <Flame size={14} />
          <Eye size={14} />
          <span>+2</span>
        </BubbleReactions>
      </Bubble>
    </div>
  );
}
