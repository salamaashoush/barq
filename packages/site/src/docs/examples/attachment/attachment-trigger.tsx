import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Copy } from "@barqjs/lucide/icons/copy";
import { FileSearch } from "@barqjs/lucide/icons/file-search";
import { X } from "@barqjs/lucide/icons/x";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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

const preview = css`
  @media (min-width: 40rem) {
    max-width: 28rem;
  }
`;

export default function AttachmentTriggerDemo() {
  const [open, setOpen] = createSignal(false);

  return (
    <div class={frame}>
      <Attachment class={full}>
        <AttachmentMedia>
          <FileSearch />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>research-summary.pdf</AttachmentTitle>
          <AttachmentDescription>Open preview dialog</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Copy link">
            <Copy />
          </AttachmentAction>
          <AttachmentAction aria-label="Remove research-summary.pdf">
            <X />
          </AttachmentAction>
        </AttachmentActions>
        <AttachmentTrigger
          aria-label="Preview research-summary.pdf"
          onPress={() => setOpen(true)}
        />
      </Attachment>
      <Dialog isOpen={open()} onOpenChange={setOpen}>
        <DialogContent class={preview}>
          <DialogHeader>
            <DialogTitle>research-summary.pdf</DialogTitle>
            <DialogDescription>
              The attachment trigger fills the card and opens the dialog, while the actions stay
              independently clickable above it.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
