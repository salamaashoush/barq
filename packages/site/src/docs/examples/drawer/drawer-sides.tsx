import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@barqjs/ui";

const DRAWER_SIDES = ["top", "right", "bottom", "left"] as const;

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

const capital = css`
  text-transform: capitalize;
`;

const content = css`
  &[data-direction="bottom"],
  &[data-direction="top"] {
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
  margin-bottom: calc(var(--spacing) * 4);
  line-height: 1.5;
`;

const paragraphs = Array.from({ length: 10 }, (_, index) => index);

export default function DrawerSides() {
  return (
    <div class={row}>
      <For each={DRAWER_SIDES}>
        {(side: (typeof DRAWER_SIDES)[number]) => (
          <Drawer direction={side}>
            <DrawerTrigger>
              <Button variant="outline" class={capital}>
                {side}
              </Button>
            </DrawerTrigger>
            <DrawerContent class={content}>
              <DrawerHeader>
                <DrawerTitle>Move Goal</DrawerTitle>
                <DrawerDescription>Set your daily activity goal.</DrawerDescription>
              </DrawerHeader>
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
              <DrawerFooter>
                <Button>Submit</Button>
                <DrawerClose variant="outline">Cancel</DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        )}
      </For>
    </div>
  );
}
