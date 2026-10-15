import { css } from "@barqjs/css";
import { Link2 } from "@barqjs/lucide/icons/link-2";
import {
  ButtonGroup,
  ButtonGroupText,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
} from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 6);
`;

export default function InputGroupButtonGroup() {
  return (
    <div class={frame}>
      <ButtonGroup>
        <ButtonGroupText>
          <Label for="input-group-button-group-url">https://</Label>
        </ButtonGroupText>
        <InputGroup>
          <InputGroupInput id="input-group-button-group-url" />
          <InputGroupAddon align="inline-end">
            <Link2 />
          </InputGroupAddon>
        </InputGroup>
        <ButtonGroupText>.com</ButtonGroupText>
      </ButtonGroup>
    </div>
  );
}
