import { css } from "@barqjs/css";
import { Flame } from "@barqjs/lucide/icons/flame";
import { ThumbsUp } from "@barqjs/lucide/icons/thumbs-up";
import { Bubble, BubbleContent, BubbleReactions } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 12);
  padding-block: calc(var(--spacing) * 12);
`;

const prose = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);

  & code {
    border-radius: calc(var(--radius) * 0.6);
    background: var(--muted);
    padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 1.5);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }
`;

export default function BubbleVariants() {
  return (
    <div class={frame}>
      <Bubble>
        <BubbleContent>This is the default primary bubble.</BubbleContent>
      </Bubble>
      <Bubble variant="secondary" align="end">
        <BubbleContent>This is the secondary variant.</BubbleContent>
      </Bubble>
      <Bubble variant="muted">
        <BubbleContent>
          This one is muted. It uses a lower emphasis color for the chat bubble.
        </BubbleContent>
        <BubbleReactions role="img" aria-label="Reaction: thumbs up">
          <ThumbsUp size={14} />
        </BubbleReactions>
      </Bubble>
      <Bubble variant="tinted" align="end">
        <BubbleContent>
          This one is tinted. The tint is a softer color derived from the primary color.
        </BubbleContent>
      </Bubble>
      <Bubble variant="outline">
        <BubbleContent>We can also use an outlined variant.</BubbleContent>
      </Bubble>
      <Bubble variant="destructive" align="end">
        <BubbleContent>Or a destructive variant with a reaction.</BubbleContent>
        <BubbleReactions role="img" aria-label="Reaction: fire">
          <Flame size={14} />
        </BubbleReactions>
      </Bubble>
      <Bubble variant="ghost">
        <BubbleContent class={prose}>
          <p>
            Ghost bubbles work for assistant text, <strong>markdown</strong>, and other content that
            should not be framed.
          </p>
          <p>
            This is perfect for assistant messages that should not have a frame and can take the
            full width of the container. You can also render <code>code</code> in it.
          </p>
          <p>Ghost bubbles are full width and can take the full width of the container.</p>
        </BubbleContent>
      </Bubble>
    </div>
  );
}
