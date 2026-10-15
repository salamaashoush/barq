import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 4);
`;

const rounded = css`
  --radius: 1rem;
`;

const menu = css`
  --radius: 0.95rem;
`;

const scope = css`
  padding-inline-end: calc(var(--spacing) * 1.5) !important;
  font-size: 0.75rem;
  line-height: 1rem;
`;

const chevron = css`
  width: calc(var(--spacing) * 3);
  height: calc(var(--spacing) * 3);
`;

export default function InputGroupDropdown() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput aria-label="File name" placeholder="Enter file name" />
        <InputGroupAddon align="inline-end">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <InputGroupButton variant="ghost" aria-label="More" size="icon-xs">
                <Ellipsis />
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem>Copy path</DropdownMenuItem>
                <DropdownMenuItem>Open location</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup class={rounded}>
        <InputGroupInput aria-label="Search query" placeholder="Enter search query" />
        <InputGroupAddon align="inline-end">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <InputGroupButton variant="ghost" class={scope}>
                Search In... <ChevronDown class={chevron} />
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class={menu}>
              <DropdownMenuGroup>
                <DropdownMenuItem>Documentation</DropdownMenuItem>
                <DropdownMenuItem>Blog Posts</DropdownMenuItem>
                <DropdownMenuItem>Changelog</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
