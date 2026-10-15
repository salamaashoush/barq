import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Bell } from "@barqjs/lucide/icons/bell";
import { CircleQuestionMark } from "@barqjs/lucide/icons/circle-question-mark";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Download } from "@barqjs/lucide/icons/download";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Eye } from "@barqjs/lucide/icons/eye";
import { File } from "@barqjs/lucide/icons/file";
import { FileCode } from "@barqjs/lucide/icons/file-code";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Folder } from "@barqjs/lucide/icons/folder";
import { FolderOpen } from "@barqjs/lucide/icons/folder-open";
import { FolderSearch } from "@barqjs/lucide/icons/folder-search";
import { Keyboard } from "@barqjs/lucide/icons/keyboard";
import { Languages } from "@barqjs/lucide/icons/languages";
import { LogOut } from "@barqjs/lucide/icons/log-out";
import { Mail } from "@barqjs/lucide/icons/mail";
import { Monitor } from "@barqjs/lucide/icons/monitor";
import { Moon } from "@barqjs/lucide/icons/moon";
import { Palette } from "@barqjs/lucide/icons/palette";
import { PanelsTopLeft } from "@barqjs/lucide/icons/panels-top-left";
import { Save } from "@barqjs/lucide/icons/save";
import { Settings } from "@barqjs/lucide/icons/settings";
import { Shield } from "@barqjs/lucide/icons/shield";
import { Sun } from "@barqjs/lucide/icons/sun";
import { User } from "@barqjs/lucide/icons/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const menu = css`
  width: calc(var(--spacing) * 44);
`;

export default function DropdownMenuComplex() {
  const [notifications, setNotifications] = createSignal({
    email: true,
    sms: false,
    push: true,
  });
  const [theme, setTheme] = createSignal("light");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline">Complex Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class={menu}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>File</DropdownMenuLabel>
          <DropdownMenuItem>
            <File />
            New File
            <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Folder />
            New Folder
            <DropdownMenuShortcut>⇧⌘N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderOpen />
              Open Recent
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Recent Projects</DropdownMenuLabel>
                <DropdownMenuItem>
                  <FileCode />
                  Project Alpha
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FileCode />
                  Project Beta
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Ellipsis />
                    More Projects
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem>
                      <FileCode />
                      Project Gamma
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <FileCode />
                      Project Delta
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <FolderSearch />
                  Browse...
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Save />
            Save
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Download />
            Export
            <DropdownMenuShortcut>⇧⌘E</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={notifications().email}
            onCheckedChange={(checked) => setNotifications({ ...notifications(), email: checked })}
          >
            <Eye />
            Show Sidebar
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={notifications().sms}
            onCheckedChange={(checked) => setNotifications({ ...notifications(), sms: checked })}
          >
            <PanelsTopLeft />
            Show Status Bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme()} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuItem>
            <User />
            Profile
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCard />
            Billing
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings />
              Settings
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Preferences</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Keyboard />
                  Keyboard Shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Languages />
                  Language
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Bell />
                    Notifications
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Notification Types</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={notifications().push}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications(), push: checked })
                        }
                      >
                        <Bell />
                        Push Notifications
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={notifications().email}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications(), email: checked })
                        }
                      >
                        <Mail />
                        Email Notifications
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Shield />
                  Privacy & Security
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <CircleQuestionMark />
            Help & Support
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileText />
            Documentation
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive">
            <LogOut />
            Sign Out
            <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
