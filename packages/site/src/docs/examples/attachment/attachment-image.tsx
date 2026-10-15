import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
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
} from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 24rem;
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

export default function AttachmentImage() {
  return (
    <div class={frame}>
      <AttachmentGroup class={full}>
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
              <AttachmentActions>
                <AttachmentAction aria-label={`Remove ${image.name}`}>
                  <X />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          )}
        </For>
      </AttachmentGroup>
    </div>
  );
}
