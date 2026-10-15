import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calculator } from "@barqjs/lucide/icons/calculator";
import { Calendar } from "@barqjs/lucide/icons/calendar";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { FaceSlightlySmiling } from "@barqjs/lucide/icons/face-slightly-smiling";
import { Settings } from "@barqjs/lucide/icons/settings";
import { User } from "@barqjs/lucide/icons/user";
import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const fit = css`
  width: fit-content;
`;

export default function CommandGroups() {
  const [open, setOpen] = createSignal(false);

  return (
    <div class={stack}>
      <Button onPress={() => setOpen(true)} variant="outline" class={fit}>
        Open Menu
      </Button>
      <CommandDialog open={open()} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem>
              <Calendar />
              <span>Calendar</span>
            </CommandItem>
            <CommandItem>
              <FaceSlightlySmiling />
              <span>Search Emoji</span>
            </CommandItem>
            <CommandItem>
              <Calculator />
              <span>Calculator</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem>
              <User />
              <span>Profile</span>
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <CreditCard />
              <span>Billing</span>
              <CommandShortcut>⌘B</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Settings />
              <span>Settings</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
