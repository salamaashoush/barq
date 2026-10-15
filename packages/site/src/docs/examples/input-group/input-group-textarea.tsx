import { css } from "@barqjs/css";
import { Braces } from "@barqjs/lucide/icons/braces";
import { Copy } from "@barqjs/lucide/icons/copy";
import { CornerDownLeft } from "@barqjs/lucide/icons/corner-down-left";
import { RefreshCw } from "@barqjs/lucide/icons/refresh-cw";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 28rem;
  gap: calc(var(--spacing) * 4);
`;

const editor = css`
  min-height: 200px;
`;

const footer = css`
  border-top: 1px solid var(--border);
`;

const header = css`
  border-bottom: 1px solid var(--border);
`;

const file = css`
  font-family: var(--font-mono);
  font-weight: 500;
`;

const end = css`
  margin-inline-start: auto;
`;

export default function InputGroupTextareaExample() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupTextarea
          id="input-group-textarea-code"
          aria-label="script.js"
          placeholder="console.log('Hello, world!');"
          class={editor}
        />
        <InputGroupAddon align="block-end" class={footer}>
          <InputGroupText>Line 1, Column 1</InputGroupText>
          <InputGroupButton size="sm" class={end} variant="default">
            Run <CornerDownLeft />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupAddon align="block-start" class={header}>
          <InputGroupText class={file}>
            <Braces />
            script.js
          </InputGroupText>
          <InputGroupButton class={end} size="icon-xs" aria-label="Reload">
            <RefreshCw />
          </InputGroupButton>
          <InputGroupButton variant="ghost" size="icon-xs" aria-label="Copy">
            <Copy />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
