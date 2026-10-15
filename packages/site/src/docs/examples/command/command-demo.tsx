import { css } from "@barqjs/css";
import { Calculator } from "@barqjs/lucide/icons/calculator";
import { Calendar } from "@barqjs/lucide/icons/calendar";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { FaceSlightlySmiling } from "@barqjs/lucide/icons/face-slightly-smiling";
import { Settings } from "@barqjs/lucide/icons/settings";
import { User } from "@barqjs/lucide/icons/user";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@barqjs/ui";

const palette = css`
  max-width: 24rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
`;

export default function CommandDemo() {
  return (
    <Command class={palette} aria-label="Commands">
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
          <CommandItem disabled>
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
    </Command>
  );
}
