import { createSignal, onCleanup, onSettled } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calculator } from "@barqjs/lucide/icons/calculator";
import { Calendar } from "@barqjs/lucide/icons/calendar";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { FaceSlightlySmiling } from "@barqjs/lucide/icons/face-slightly-smiling";
import { Settings } from "@barqjs/lucide/icons/settings";
import { User } from "@barqjs/lucide/icons/user";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@barqjs/ui";

const hint = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const key = css`
  pointer-events: none;
  display: inline-flex;
  height: calc(var(--spacing) * 5);
  align-items: center;
  gap: calc(var(--spacing) * 1);
  border-radius: 0.25rem;
  border: 1px solid var(--border);
  background-color: var(--muted);
  padding-inline: calc(var(--spacing) * 1.5);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--muted-foreground);
  opacity: 1;
  user-select: none;
`;

const glyph = css`
  font-size: 0.75rem;
  line-height: 1rem;
`;

export default function CommandDialogDemo() {
  const [open, setOpen] = createSignal(false);

  const down = (event: KeyboardEvent): void => {
    if (event.key === "j" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setOpen(!open());
    }
  };
  let listening = false;
  onSettled(() => {
    document.addEventListener("keydown", down);
    listening = true;
  });
  onCleanup(() => {
    if (listening) document.removeEventListener("keydown", down);
  });

  return (
    <>
      <p class={hint}>
        Press{" "}
        <kbd class={key}>
          <span class={glyph}>⌘</span>J
        </kbd>
      </p>
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
    </>
  );
}
