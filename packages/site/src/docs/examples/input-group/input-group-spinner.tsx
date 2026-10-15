import { css } from "@barqjs/css";
import { Loader } from "@barqjs/lucide/icons/loader";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, Spinner } from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 4);
`;

const muted = css`
  color: var(--muted-foreground);
`;

const spin = css`
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export default function InputGroupSpinner() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput aria-label="Search" placeholder="Searching..." />
        <InputGroupAddon align="inline-end">
          <Spinner />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Job" placeholder="Processing..." />
        <InputGroupAddon>
          <Spinner />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Changes" placeholder="Saving changes..." />
        <InputGroupAddon align="inline-end">
          <InputGroupText>Saving...</InputGroupText>
          <Spinner />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Data" placeholder="Refreshing data..." />
        <InputGroupAddon>
          <Loader class={spin} />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <InputGroupText class={muted}>Please wait...</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
