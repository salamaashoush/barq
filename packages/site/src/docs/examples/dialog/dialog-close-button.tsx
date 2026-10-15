import { css } from "@barqjs/css";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  srOnly,
} from "@barqjs/ui";

const medium = css`
  @media (width >= 40rem) {
    max-width: 28rem;
  }
`;

const row = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

const field = css`
  display: grid;
  flex: 1;
  gap: calc(var(--spacing) * 2);
`;

const footer = css`
  @media (width >= 40rem) {
    justify-content: flex-start;
  }
`;

export default function DialogCloseButton() {
  return (
    <Dialog>
      <DialogTrigger>
        <Button variant="outline">Share</Button>
      </DialogTrigger>
      <DialogContent class={medium}>
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>Anyone who has this link will be able to view this.</DialogDescription>
        </DialogHeader>
        <div class={row}>
          <div class={field}>
            <Label for="dialog-close-button-link" class={srOnly}>
              Link
            </Label>
            <Input
              id="dialog-close-button-link"
              defaultValue="https://example.com/docs/installation"
              readOnly
            />
          </div>
        </div>
        <DialogFooter class={footer}>
          <DialogClose variant="default">Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
