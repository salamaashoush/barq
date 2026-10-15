import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { FileCode } from "@barqjs/lucide/icons/file-code";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Table } from "@barqjs/lucide/icons/table";
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

const card = css`
  width: 16rem;
`;

const picture = css`
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, var(--muted), var(--border));
`;

type Item = { readonly name: string; readonly meta: string } & (
  | { readonly icon: typeof FileText }
  | { readonly image: true }
);

const items: readonly Item[] = [
  { name: "briefing-notes.pdf", meta: "PDF · 1.4 MB", icon: FileText },
  { name: "workspace.png", meta: "PNG · 820 KB", image: true },
  { name: "customers.csv", meta: "CSV · 18 KB", icon: Table },
  { name: "renderer.tsx", meta: "TSX · 12 KB", icon: FileCode },
];

export default function AttachmentGroupDemo() {
  return (
    <div class={frame}>
      <AttachmentGroup class={full}>
        <For each={() => items}>
          {(item: Item) => (
            <Attachment class={card}>
              {() =>
                "icon" in item ? (
                  <AttachmentMedia>
                    <item.icon />
                  </AttachmentMedia>
                ) : (
                  <AttachmentMedia variant="image">
                    <div role="img" aria-label={item.name} class={picture} />
                  </AttachmentMedia>
                )
              }
              <AttachmentContent>
                <AttachmentTitle>{item.name}</AttachmentTitle>
                <AttachmentDescription>{item.meta}</AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction aria-label={`Remove ${item.name}`}>
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
