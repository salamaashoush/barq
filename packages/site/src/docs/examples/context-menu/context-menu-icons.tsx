import { css } from "@barqjs/css";
import { ClipboardPaste } from "@barqjs/lucide/icons/clipboard-paste";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Scissors } from "@barqjs/lucide/icons/scissors";
import { Trash } from "@barqjs/lucide/icons/trash";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@barqjs/ui";

const area = css`
  display: flex;
  aspect-ratio: 16 / 9;
  width: 100%;
  max-width: 20rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xl);
  border: 1px dashed var(--border);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const fine = css`
  display: none;

  @media (pointer: fine) {
    display: inline-block;
  }
`;

const coarse = css`
  display: none;

  @media (pointer: coarse) {
    display: inline-block;
  }
`;

export default function ContextMenuIcons() {
  return (
    <ContextMenu>
      <ContextMenuTrigger class={area}>
        <span class={fine}>Right click here</span>
        <span class={coarse}>Long press here</span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem>
            <Copy />
            Copy
          </ContextMenuItem>
          <ContextMenuItem>
            <Scissors />
            Cut
          </ContextMenuItem>
          <ContextMenuItem>
            <ClipboardPaste />
            Paste
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive">
            <Trash />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
