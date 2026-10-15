import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { FileCode } from "@barqjs/lucide/icons/file-code";
import { X } from "@barqjs/lucide/icons/x";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  Spinner,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  margin-inline: auto;
  padding-block: calc(var(--spacing) * 12);
`;

const full = css`
  width: 100%;
`;

const picture = css`
  width: 100%;
  aspect-ratio: 1 / 1;
`;

const workspace = css`
  background: linear-gradient(135deg, var(--muted), var(--border));
`;

const desk = css`
  background: linear-gradient(45deg, var(--border), var(--muted));
`;

const office = css`
  background: radial-gradient(circle at 30% 30%, var(--muted), var(--border));
`;

interface Picture {
  readonly name: string;
  readonly meta: string;
  readonly alt: string;
  readonly tone: string;
}

const images: readonly Picture[] = [
  { name: "workspace.png", meta: "PNG · 820 KB", alt: "Workspace", tone: workspace },
  { name: "desk-reference.jpg", meta: "JPG · 1.1 MB", alt: "Desk", tone: desk },
  { name: "office-reference.jpg", meta: "JPG · 940 KB", alt: "Office", tone: office },
];

export default function AttachmentDemo() {
  return (
    <div class={frame}>
      <AttachmentGroup>
        <For each={() => images}>
          {(image: Picture) => (
            <Attachment orientation="vertical">
              <AttachmentMedia variant="image">
                <div role="img" aria-label={image.alt} class={`${picture} ${image.tone}`} />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{image.name}</AttachmentTitle>
                <AttachmentDescription>{image.meta}</AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          )}
        </For>
      </AttachmentGroup>
      <Attachment state="uploading" class={full}>
        <AttachmentMedia>
          <Spinner />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>sales-dashboard.pdf</AttachmentTitle>
          <AttachmentDescription>Uploading · 64%</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Cancel upload">
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment class={full}>
        <AttachmentMedia>
          <FileCode />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>message-renderer.tsx</AttachmentTitle>
          <AttachmentDescription>TypeScript · 12 KB</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Remove message-renderer.tsx">
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    </div>
  );
}
