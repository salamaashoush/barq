import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Calculator } from "@barqjs/lucide/icons/calculator";
import { Calendar } from "@barqjs/lucide/icons/calendar";
import { CircleQuestionMark } from "@barqjs/lucide/icons/circle-question-mark";
import { ClipboardPaste } from "@barqjs/lucide/icons/clipboard-paste";
import { Code } from "@barqjs/lucide/icons/code";
import { Copy } from "@barqjs/lucide/icons/copy";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Folder } from "@barqjs/lucide/icons/folder";
import { FolderPlus } from "@barqjs/lucide/icons/folder-plus";
import { House } from "@barqjs/lucide/icons/house";
import { Image } from "@barqjs/lucide/icons/image";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { LayoutGrid } from "@barqjs/lucide/icons/layout-grid";
import { List } from "@barqjs/lucide/icons/list";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Scissors } from "@barqjs/lucide/icons/scissors";
import { Settings } from "@barqjs/lucide/icons/settings";
import { Trash } from "@barqjs/lucide/icons/trash";
import { User } from "@barqjs/lucide/icons/user";
import { ZoomIn } from "@barqjs/lucide/icons/zoom-in";
import { ZoomOut } from "@barqjs/lucide/icons/zoom-out";
import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const fit = css`
  width: fit-content;
`;

export default function CommandScrollable() {
  const [open, setOpen] = createSignal(false);

  return (
    <div class={stack}>
      <Button onPress={() => setOpen(true)} variant="outline" class={fit}>
        Open Menu
      </Button>
      <CommandDialog open={open()} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem>
              <House />
              <span>Home</span>
              <CommandShortcut>⌘H</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Inbox />
              <span>Inbox</span>
              <CommandShortcut>⌘I</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <FileText />
              <span>Documents</span>
              <CommandShortcut>⌘D</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Folder />
              <span>Folders</span>
              <CommandShortcut>⌘F</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem>
              <Plus />
              <span>New File</span>
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <FolderPlus />
              <span>New Folder</span>
              <CommandShortcut>⇧⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Copy />
              <span>Copy</span>
              <CommandShortcut>⌘C</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Scissors />
              <span>Cut</span>
              <CommandShortcut>⌘X</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <ClipboardPaste />
              <span>Paste</span>
              <CommandShortcut>⌘V</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Trash />
              <span>Delete</span>
              <CommandShortcut>⌫</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="View">
            <CommandItem>
              <LayoutGrid />
              <span>Grid View</span>
            </CommandItem>
            <CommandItem>
              <List />
              <span>List View</span>
            </CommandItem>
            <CommandItem>
              <ZoomIn />
              <span>Zoom In</span>
              <CommandShortcut>⌘+</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <ZoomOut />
              <span>Zoom Out</span>
              <CommandShortcut>⌘-</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Account">
            <CommandItem>
              <User />
              <span>Profile</span>
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <CreditCard />
              <span>Billing</span>
              <CommandShortcut>⌘B</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Settings />
              <span>Settings</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Bell />
              <span>Notifications</span>
            </CommandItem>
            <CommandItem>
              <CircleQuestionMark />
              <span>Help & Support</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Tools">
            <CommandItem>
              <Calculator />
              <span>Calculator</span>
            </CommandItem>
            <CommandItem>
              <Calendar />
              <span>Calendar</span>
            </CommandItem>
            <CommandItem>
              <Image />
              <span>Image Editor</span>
            </CommandItem>
            <CommandItem>
              <Code />
              <span>Code Editor</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
