import { css } from "@barqjs/css";
import { Search } from "@barqjs/lucide/icons/search";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@barqjs/ui";

const frame = css`
  max-width: 20rem;
`;

export default function InputGroupDemo() {
  return (
    <InputGroup class={frame}>
      <InputGroupInput aria-label="Search" placeholder="Search..." />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">12 results</InputGroupAddon>
    </InputGroup>
  );
}
