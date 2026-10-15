import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Clock } from "@barqjs/lucide/icons/clock";
import { FileExclamationPoint } from "@barqjs/lucide/icons/file-exclamation-point";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { RefreshCw } from "@barqjs/lucide/icons/refresh-cw";
import { X } from "@barqjs/lucide/icons/x";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  Spinner,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  margin-inline: auto;
  padding-block: calc(var(--spacing) * 12);
`;

const full = css`
  width: 100%;
`;

export default function AttachmentStates() {
  return (
    <div class={frame}>
      <Attachment state="idle" class={full}>
        <AttachmentMedia>
          <Clock />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>selected-file.pdf</AttachmentTitle>
          <AttachmentDescription>Ready to upload</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Remove selected-file.pdf">
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="uploading" class={full}>
        <AttachmentMedia>
          <Spinner />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>design-system.zip</AttachmentTitle>
          <AttachmentDescription>Uploading · 64%</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Cancel upload">
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="processing" class={full}>
        <AttachmentMedia>
          <FileText />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>market-research.pdf</AttachmentTitle>
          <AttachmentDescription>Processing document</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Remove market-research.pdf">
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="error" class={full}>
        <AttachmentMedia>
          <FileExclamationPoint />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>financial-model.xlsx</AttachmentTitle>
          <AttachmentDescription>Upload failed. Try again.</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Retry upload">
            <RefreshCw />
          </AttachmentAction>
          <AttachmentAction aria-label="Remove financial-model.xlsx">
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Attachment state="done" class={full}>
        <AttachmentMedia>
          <Check />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>uploaded-report.pdf</AttachmentTitle>
          <AttachmentDescription>Uploaded · 1.8 MB</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction aria-label="Remove uploaded-report.pdf">
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    </div>
  );
}
