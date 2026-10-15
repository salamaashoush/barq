import { For } from "@barqjs/core";
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

export default function DialogStickyFooter() {
  return (
    <Dialog>
      <DialogTrigger>
        <Button variant="outline">Sticky Footer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sticky Footer</DialogTitle>
          <DialogDescription>
            This dialog has a sticky footer that stays visible while the content scrolls.
          </DialogDescription>
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
        <DialogFooter>
          <DialogClose>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
