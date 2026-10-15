import { css } from "@barqjs/css";
import { Search } from "@barqjs/lucide/icons/search";
import { InputGroup, InputGroupAddon, InputGroupInput, Kbd } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 20rem;
`;

export default function KbdInputGroup() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput aria-label="Search" placeholder="Search..." />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
