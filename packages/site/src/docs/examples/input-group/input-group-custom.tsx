import { css } from "@barqjs/css";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 6);
`;

const autosize = css`
  display: flex;
  field-sizing: content;
  min-height: calc(var(--spacing) * 16);
  width: 100%;
  resize: none;
  border-radius: var(--radius-md);
  background-color: transparent;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  font-size: 1rem;
  line-height: 1.5rem;
  outline: none;
  transition:
    color 150ms,
    box-shadow 150ms;

  @media (width >= 48rem) {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
`;

const end = css`
  margin-inline-start: auto;
`;

export default function InputGroupCustom() {
  return (
    <div class={frame}>
      <InputGroup>
        <textarea
          data-slot="input-group-control"
          class={autosize}
          aria-label="Message"
          placeholder="Autoresize textarea..."
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton class={end} size="sm" variant="default">
            Submit
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
