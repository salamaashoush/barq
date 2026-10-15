import { css } from "@barqjs/css";
import { Copy } from "@barqjs/lucide/icons/copy";
import { RefreshCcw } from "@barqjs/lucide/icons/refresh-ccw";
import { ThumbsDown } from "@barqjs/lucide/icons/thumbs-down";
import { ThumbsUp } from "@barqjs/lucide/icons/thumbs-up";
import { Bubble, BubbleContent, Button, Message, MessageContent, MessageFooter } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

const spaced = css`
  gap: calc(var(--spacing) * 2);
`;

const failed = css`
  font-weight: 400;
  color: var(--destructive);
`;

export default function MessageActionsDemo() {
  return (
    <div class={frame}>
      <Message>
        <MessageContent>
          <Bubble variant="muted">
            <BubbleContent>The install failure is coming from the workspace package.</BubbleContent>
          </Bubble>
          <MessageFooter>
            <Button variant="ghost" size="icon" aria-label="Copy" title="Copy">
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Like" title="Like">
              <ThumbsUp />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Dislike" title="Dislike">
              <ThumbsDown />
            </Button>
          </MessageFooter>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent>Okay drop me a link. Taking a look...</BubbleContent>
          </Bubble>
          <MessageFooter class={spaced}>
            <span class={failed}>Failed to send</span>
            <Button variant="ghost" size="icon-xs" title="Retry" aria-label="Retry">
              <RefreshCcw />
            </Button>
          </MessageFooter>
        </MessageContent>
      </Message>
    </div>
  );
}
