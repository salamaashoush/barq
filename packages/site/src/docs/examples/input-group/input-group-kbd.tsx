import { css } from "@barqjs/css";
import { Search } from "@barqjs/lucide/icons/search";
import { InputGroup, InputGroupAddon, InputGroupInput, Kbd } from "@barqjs/ui";

const frame = css`
  max-width: 24rem;
`;

const muted = css`
  color: var(--muted-foreground);
`;

export default function InputGroupKbd() {
  return (
    <InputGroup class={frame}>
      <InputGroupInput aria-label="Search" placeholder="Search..." />
      <InputGroupAddon>
        <Search class={muted} />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <Kbd>⌘K</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
