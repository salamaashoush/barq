import { css } from "@barqjs/css";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
  Spinner,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const end = css`
  margin-inline-start: auto;
`;

export default function SpinnerInputGroup() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput aria-label="Message" placeholder="Send a message..." disabled />
        <InputGroupAddon align="inline-end">
          <Spinner />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea aria-label="Message" placeholder="Send a message..." disabled />
        <InputGroupAddon align="block-end">
          <Spinner /> Validating...
          <InputGroupButton class={end} variant="default" aria-label="Send">
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
