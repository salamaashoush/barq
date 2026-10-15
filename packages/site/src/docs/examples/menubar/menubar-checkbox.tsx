import { css } from "@barqjs/css";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@barqjs/ui";

const bar = css`
  width: calc(var(--spacing) * 72);
`;

const wide = css`
  width: calc(var(--spacing) * 64);
`;

export default function MenubarCheckbox() {
  return (
    <Menubar class={bar}>
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent class={wide}>
          <MenubarCheckboxItem>Always Show Bookmarks Bar</MenubarCheckboxItem>
          <MenubarCheckboxItem defaultChecked>Always Show Full URLs</MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem inset>
            Reload <MenubarShortcut>⌘R</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled inset>
            Force Reload <MenubarShortcut>⇧⌘R</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Format</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem defaultChecked>Strikethrough</MenubarCheckboxItem>
          <MenubarCheckboxItem>Code</MenubarCheckboxItem>
          <MenubarCheckboxItem>Superscript</MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
