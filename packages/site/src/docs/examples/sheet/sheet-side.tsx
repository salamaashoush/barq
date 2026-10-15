import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@barqjs/ui";

const SHEET_SIDES = ["top", "right", "bottom", "left"] as const;

const paragraphs = Array.from({ length: 10 }, (_, index) => index);

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

const capital = css`
  text-transform: capitalize;
`;

const content = css`
  &[data-side="bottom"],
  &[data-side="top"] {
    max-height: 50vh;
  }
`;

const scroller = css`
  overflow-y: auto;
  padding-inline: calc(var(--spacing) * 4);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const paragraph = css`
  margin-bottom: calc(var(--spacing) * 2);
  line-height: 1.625;
`;

export default function SheetSide() {
  return (
    <div class={row}>
      <For each={SHEET_SIDES}>
        {(side: (typeof SHEET_SIDES)[number]) => (
          <Sheet>
            <SheetTrigger>
              <Button variant="outline" class={capital}>
                {side}
              </Button>
            </SheetTrigger>
            <SheetContent side={side} class={content}>
              <SheetHeader>
                <SheetTitle>Edit profile</SheetTitle>
                <SheetDescription>
                  Make changes to your profile here. Click save when you're done.
                </SheetDescription>
              </SheetHeader>
              <div class={scroller}>
                <For each={paragraphs}>
                  {() => (
                    <p class={paragraph}>
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                      incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
                      nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                      Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
                      eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt
                      in culpa qui officia deserunt mollit anim id est laborum.
                    </p>
                  )}
                </For>
              </div>
              <SheetFooter>
                <Button type="submit">Save changes</Button>
                <SheetClose variant="outline">Cancel</SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}
      </For>
    </div>
  );
}
