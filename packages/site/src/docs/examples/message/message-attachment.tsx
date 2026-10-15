import { css } from "@barqjs/css";
import { Download } from "@barqjs/lucide/icons/download";
import { FileText } from "@barqjs/lucide/icons/file-text";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  Bubble,
  BubbleContent,
  Message,
  MessageContent,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

const picture = css`
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--muted), var(--border));
`;

export default function MessageAttachmentDemo() {
  return (
    <div class={frame}>
      <Message align="end">
        <MessageContent>
          <Attachment orientation="vertical">
            <AttachmentMedia variant="image">
              <div role="img" aria-label="Workspace" class={picture} />
            </AttachmentMedia>
          </Attachment>
          <Bubble>
            <BubbleContent>
              Here's the image. Can you add it to the PDF? Use it for the cover page.
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <Message>
        <MessageContent>
          <Bubble variant="muted">
            <BubbleContent>
              Done. Here's the PDF with the image added as the cover page.
            </BubbleContent>
          </Bubble>
          <Attachment>
            <AttachmentMedia>
              <FileText />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>sales-dashboard.pdf</AttachmentTitle>
              <AttachmentDescription>PDF · 2.4 MB</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                type="button"
                title="Download"
                aria-label="Download"
                size="icon-sm"
                variant="secondary"
              >
                <Download />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent>Thanks. Looks good.</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </div>
  );
}
