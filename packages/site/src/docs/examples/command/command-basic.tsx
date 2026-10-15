import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const fit = css`
  width: fit-content;
`;

export default function CommandBasic() {
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
            <CommandItem>Calendar</CommandItem>
            <CommandItem>Search Emoji</CommandItem>
            <CommandItem>Calculator</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
