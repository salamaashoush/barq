import { css } from "@barqjs/css";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@barqjs/ui";

const frame = css`
  max-width: 24rem;
`;

const tall = css`
  height: auto;
`;

const end = css`
  margin-inline-start: auto;
`;

export default function InputGroupBlockEnd() {
  return (
    <FieldGroup class={frame}>
      <Field>
        <FieldLabel for="block-end-input">Input</FieldLabel>
        <InputGroup class={tall}>
          <InputGroupInput id="block-end-input" placeholder="Enter amount" />
          <InputGroupAddon align="block-end">
            <InputGroupText>USD</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>Footer positioned below the input.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="block-end-textarea">Textarea</FieldLabel>
        <InputGroup>
          <InputGroupTextarea id="block-end-textarea" placeholder="Write a comment..." />
          <InputGroupAddon align="block-end">
            <InputGroupText>0/280</InputGroupText>
            <InputGroupButton variant="default" size="sm" class={end}>
              Post
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>Footer positioned below the textarea.</FieldDescription>
      </Field>
    </FieldGroup>
  );
}
