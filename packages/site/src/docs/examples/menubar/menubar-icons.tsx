import { css } from "@barqjs/css";
import { CircleQuestionMark } from "@barqjs/lucide/icons/circle-question-mark";
import { File } from "@barqjs/lucide/icons/file";
import { Folder } from "@barqjs/lucide/icons/folder";
import { Save } from "@barqjs/lucide/icons/save";
import { Settings } from "@barqjs/lucide/icons/settings";
import { Trash } from "@barqjs/lucide/icons/trash";
import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@barqjs/ui";

const bar = css`
  width: calc(var(--spacing) * 72);
`;

export default function MenubarIcons() {
  return (
    <Menubar class={bar}>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <File />
            New File <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <Folder />
            Open Folder
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <Save />
            Save <MenubarShortcut>⌘S</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>More</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem>
              <Settings />
              Settings
            </MenubarItem>
            <MenubarItem>
              <CircleQuestionMark />
              Help
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem variant="destructive">
              <Trash />
              Delete
            </MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
