import { createSignal } from "@barqjs/core";
import {
  Button,
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
  Grid,
  Stack,
  Text,
} from "@barqjs/arc";
import { edge, layout, rounded, space, surface, type } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { LogOut } from "@barqjs/lucide/icons/log-out";
import { Settings } from "@barqjs/lucide/icons/settings";
import { User } from "@barqjs/lucide/icons/user";

const demo = layer("demo");
const area = demo(surface.sunken, layout.centre, type.meta, rounded.md, edge.frame, {
  minHeight: space.x16,
  padding: space.x6,
  borderStyle: "dashed",
});

export default function Menus() {
  const [last, setLast] = createSignal("Nothing chosen yet");
  const [compact, setCompact] = createSignal(false);
  const [sort, setSort] = createSignal("updated");
  const [grid, setGrid] = createSignal(true);
  const [zoom, setZoom] = createSignal("100");
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <Stack gap={2} align="start">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline">
              Salama
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>salama@example.com</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setLast("Profile")}>
                <User />
                Profile
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLast("Billing")}>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Settings />
                Settings, managed by your admin
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={compact()} onCheckedChange={setCompact}>
              Compact rows
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={sort()} onValueChange={setSort}>
                  <DropdownMenuRadioItem value="updated">Last updated</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="owner">Owner</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setLast("Signed out")}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Text size="sm" color="muted">
          {last()}; compact {compact() ? "on" : "off"}; sorted by {sort()}.
        </Text>
      </Stack>

      <Stack gap={2}>
        <ContextMenu>
          <ContextMenuTrigger class={area}>Right-click or long-press the canvas</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuItem onSelect={() => setLast("Pasted")}>
                Paste
                <ContextMenuShortcut>⌘V</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled>
                Undo
                <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Arrange</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem onSelect={() => setLast("Brought to front")}>
                    Bring to front
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => setLast("Sent to back")}>
                    Send to back
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuCheckboxItem checked={grid()} onCheckedChange={setGrid}>
              Show grid
            </ContextMenuCheckboxItem>
            <ContextMenuSeparator />
            <ContextMenuRadioGroup value={zoom()} onValueChange={setZoom}>
              <ContextMenuLabel>Zoom</ContextMenuLabel>
              <ContextMenuRadioItem value="50">50%</ContextMenuRadioItem>
              <ContextMenuRadioItem value="100">100%</ContextMenuRadioItem>
              <ContextMenuRadioItem value="200">200%</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => setLast("Canvas cleared")}>
              Clear canvas
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <Text size="sm" color="muted">
          Grid {grid() ? "shown" : "hidden"}, zoom {zoom()}%.
        </Text>
      </Stack>
    </Grid>
  );
}
