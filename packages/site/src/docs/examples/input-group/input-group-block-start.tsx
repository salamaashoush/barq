import { css } from "@barqjs/css";
import { Copy } from "@barqjs/lucide/icons/copy";
import { FileCode } from "@barqjs/lucide/icons/file-code";
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
  srOnly,
} from "@barqjs/ui";

const frame = css`
  max-width: 24rem;
`;

const tall = css`
  height: auto;
`;

const muted = css`
  color: var(--muted-foreground);
`;

const end = css`
  margin-inline-start: auto;
`;

const mono = css`
  font-family: var(--font-mono);
`;

const code = css`
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

export default function InputGroupBlockStart() {
  return (
    <FieldGroup class={frame}>
      <Field>
        <FieldLabel for="block-start-input">Input</FieldLabel>
        <InputGroup class={tall}>
          <InputGroupInput id="block-start-input" placeholder="Enter your name" />
          <InputGroupAddon align="block-start">
            <InputGroupText>Full Name</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>Header positioned above the input.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="block-start-textarea">Textarea</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="block-start-textarea"
            placeholder="console.log('Hello, world!');"
            class={code}
          />
          <InputGroupAddon align="block-start">
            <FileCode class={muted} />
            <InputGroupText class={mono}>script.js</InputGroupText>
            <InputGroupButton size="icon-xs" class={end}>
              <Copy />
              <span class={srOnly}>Copy</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>Header positioned above the textarea.</FieldDescription>
      </Field>
    </FieldGroup>
  );
}
