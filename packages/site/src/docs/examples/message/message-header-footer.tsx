import { css } from "@barqjs/css";
import {
  Bubble,
  BubbleContent,
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

const plain = css`
  font-weight: 400;
`;

export default function MessageHeaderFooterDemo() {
  return (
    <div class={frame}>
      <Message>
        <MessageContent>
          <MessageHeader>Mira</MessageHeader>
          <Bubble variant="muted">
            <BubbleContent>I already checked the logs.</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent>
              Send the report to the team. Ping @salama if you need help.
            </BubbleContent>
          </Bubble>
          <MessageFooter>
            <div>
              Read <span class={plain}>Yesterday</span>
            </div>
          </MessageFooter>
        </MessageContent>
      </Message>
    </div>
  );
}
