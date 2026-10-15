import { css } from "@barqjs/css";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
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

const menu = css`
  width: calc(var(--spacing) * 48);
`;

const submenu = css`
  width: calc(var(--spacing) * 44);
`;

export default function ContextMenuDemo() {
  return (
    <ContextMenu>
      <ContextMenuTrigger class={area}>
        <span class={fine}>Right click here</span>
        <span class={coarse}>Long press here</span>
      </ContextMenuTrigger>
      <ContextMenuContent class={menu}>
        <ContextMenuGroup>
          <ContextMenuItem>
            Back
            <ContextMenuShortcut>⌘[</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled>
            Forward
            <ContextMenuShortcut>⌘]</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            Reload
            <ContextMenuShortcut>⌘R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>More Tools</ContextMenuSubTrigger>
            <ContextMenuSubContent class={submenu}>
              <ContextMenuGroup>
                <ContextMenuItem>Save Page...</ContextMenuItem>
                <ContextMenuItem>Create Shortcut...</ContextMenuItem>
                <ContextMenuItem>Name Window...</ContextMenuItem>
              </ContextMenuGroup>
              <ContextMenuSeparator />
              <ContextMenuGroup>
                <ContextMenuItem>Developer Tools</ContextMenuItem>
              </ContextMenuGroup>
              <ContextMenuSeparator />
              <ContextMenuGroup>
                <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
              </ContextMenuGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuCheckboxItem defaultChecked>Show Bookmarks</ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem>Show Full URLs</ContextMenuCheckboxItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuRadioGroup defaultValue="salama">
            <ContextMenuLabel>People</ContextMenuLabel>
            <ContextMenuRadioItem value="salama">Salama Ashoush</ContextMenuRadioItem>
            <ContextMenuRadioItem value="mira">Mira Kamal</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
