import { css } from "@barqjs/css";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 6);
`;

const flush = css`
  padding-inline-start: calc(var(--spacing) * 0.5) !important;
`;

const hint = css`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

export default function InputGroupTextExample() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="Amount" placeholder="0.00" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>USD</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="Website" placeholder="example.com" class={flush} />
        <InputGroupAddon align="inline-end">
          <InputGroupText>.com</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Username" placeholder="Enter your username" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>@example.com</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea aria-label="Message" placeholder="Enter your message" />
        <InputGroupAddon align="block-end">
          <InputGroupText class={hint}>120 characters left</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
