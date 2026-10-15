import { css } from "@barqjs/css";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { Code } from "@barqjs/lucide/icons/code";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Info } from "@barqjs/lucide/icons/info";
import { RefreshCw } from "@barqjs/lucide/icons/refresh-cw";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
  Textarea,
  srOnly,
} from "@barqjs/ui";

const end = css`
  margin-inline-start: auto;
`;

const trailing = css`
  margin-inline-start: auto;
  color: var(--muted-foreground);
`;

const send = css`
  margin-inline-start: auto;
  border-radius: 9999px;
`;

const comment = css`
  min-height: 120px;
`;

const editor = css`
  min-height: 300px;
  padding-block: calc(var(--spacing) * 3);
`;

const header = css`
  border-bottom: 1px solid var(--border);
`;

const footer = css`
  border-top: 1px solid var(--border);
`;

const file = css`
  font-family: var(--font-mono);
  font-weight: 500;
`;

export default function InputGroupTextareaExamples() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel for="input-group-textarea-examples-default">
          Default Textarea (No Input Group)
        </FieldLabel>
        <Textarea
          id="input-group-textarea-examples-default"
          placeholder="Enter your text here..."
        />
      </Field>
      <Field>
        <FieldLabel for="input-group-textarea-examples-group">Input Group</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="input-group-textarea-examples-group"
            placeholder="Enter your text here..."
          />
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field isInvalid>
        <FieldLabel for="input-group-textarea-examples-invalid">Invalid</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="input-group-textarea-examples-invalid"
            placeholder="Enter your text here..."
            aria-invalid="true"
          />
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field isDisabled>
        <FieldLabel for="input-group-textarea-examples-disabled">Disabled</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="input-group-textarea-examples-disabled"
            placeholder="Enter your text here..."
            disabled
          />
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="input-group-textarea-examples-prompt">Addon (block-start)</FieldLabel>
        <InputGroup>
          <InputGroupTextarea id="input-group-textarea-examples-prompt" />
          <InputGroupAddon align="block-start">
            <InputGroupText>Ask, Search or Chat...</InputGroupText>
            <Info class={trailing} />
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="input-group-textarea-examples-footer">Addon (block-end)</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="input-group-textarea-examples-footer"
            placeholder="Enter your text here..."
          />
          <InputGroupAddon align="block-end">
            <InputGroupText>0/280 characters</InputGroupText>
            <InputGroupButton variant="default" size="icon-xs" class={send}>
              <ArrowUp />
              <span class={srOnly}>Send</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-textarea-examples-comment">Addon (Buttons)</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="input-group-textarea-examples-comment"
            placeholder="Share your thoughts..."
            class={comment}
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton variant="ghost" class={end} size="sm">
              Cancel
            </InputGroupButton>
            <InputGroupButton variant="default" size="sm">
              Post Comment
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-textarea-examples-code">Code Editor</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            id="input-group-textarea-examples-code"
            placeholder="console.log('Hello, world!');"
            class={editor}
          />
          <InputGroupAddon align="block-start" class={header}>
            <InputGroupText class={file}>
              <Code />
              script.js
            </InputGroupText>
            <InputGroupButton size="icon-xs" class={end} aria-label="Reload">
              <RefreshCw />
            </InputGroupButton>
            <InputGroupButton size="icon-xs" variant="ghost" aria-label="Copy">
              <Copy />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupAddon align="block-end" class={footer}>
            <InputGroupText>Line 1, Column 1</InputGroupText>
            <InputGroupText class={end}>JavaScript</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}
