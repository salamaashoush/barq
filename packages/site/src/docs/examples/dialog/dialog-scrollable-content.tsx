import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barqjs/ui";

const paragraphs: readonly number[] = Array.from({ length: 10 }, (_, index) => index);

const scroller = css`
  margin-inline: calc(var(--spacing) * -4);
  max-height: 50vh;
  overflow-y: auto;
  padding-inline: calc(var(--spacing) * 4);
  scrollbar-width: none;
`;

const paragraph = css`
  margin-bottom: calc(var(--spacing) * 4);
  line-height: 1.5;
`;

export default function DialogScrollableContent() {
  return (
    <Dialog>
      <DialogTrigger>
        <Button variant="outline">Scrollable Content</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scrollable Content</DialogTitle>
          <DialogDescription>This is a dialog with scrollable content.</DialogDescription>
        </DialogHeader>
        <div class={scroller}>
          <For each={() => paragraphs}>
            {() => (
              <p class={paragraph}>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
                exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute
                irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
                pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia
                deserunt mollit anim id est laborum.
              </p>
            )}
          </For>
        </div>
      </DialogContent>
    </Dialog>
  );
}
