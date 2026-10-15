import { css } from "@barqjs/css";
import { Bot } from "@barqjs/lucide/icons/bot";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import {
  Button,
  ButtonGroup,
  Field,
  FieldDescription,
  FieldLabel,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Textarea,
} from "@barqjs/ui";

const panel = css`
  border-radius: var(--radius-xl);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const srOnly = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
`;

const fixed = css`
  resize: none;
`;

export default function ButtonGroupPopover() {
  return (
    <ButtonGroup>
      <Button variant="outline">
        <Bot />
        Copilot
      </Button>
      <Popover>
        <PopoverTrigger>
          <Button variant="outline" size="icon" aria-label="Open Popover">
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class={panel}>
          <PopoverHeader>
            <PopoverTitle>Start a new task with Copilot</PopoverTitle>
            <PopoverDescription>Describe your task in natural language.</PopoverDescription>
          </PopoverHeader>
          <Field>
            <FieldLabel for="button-group-popover-task" class={srOnly}>
              Task Description
            </FieldLabel>
            <Textarea id="button-group-popover-task" placeholder="I need to..." class={fixed} />
            <FieldDescription>Copilot will open a pull request for review.</FieldDescription>
          </Field>
        </PopoverContent>
      </Popover>
    </ButtonGroup>
  );
}
