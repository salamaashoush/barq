import { createSignal } from "@barqjs/core";
import {
  IconButton,
  Stack,
  Text,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarSeparator,
} from "@barqjs/arc";
import { AlignCenter } from "@barqjs/lucide/icons/align-center";
import { AlignLeft } from "@barqjs/lucide/icons/align-left";
import { AlignRight } from "@barqjs/lucide/icons/align-right";
import { Bold } from "@barqjs/lucide/icons/bold";
import { Italic } from "@barqjs/lucide/icons/italic";
import { Link } from "@barqjs/lucide/icons/link";
import { List } from "@barqjs/lucide/icons/list";
import { ListOrdered } from "@barqjs/lucide/icons/list-ordered";
import { Redo2 } from "@barqjs/lucide/icons/redo-2";
import { Underline } from "@barqjs/lucide/icons/underline";
import { Undo2 } from "@barqjs/lucide/icons/undo-2";

export default function Toolbars() {
  const [marks, setMarks] = createSignal<string[]>(["bold"]);
  const [align, setAlign] = createSignal("left");
  return (
    <Stack gap={5}>
      <Toolbar aria-label="Formatting">
        <IconButton label="Undo" shortcut="Mod+Z" variant="ghost" size="sm">
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" shortcut="Mod+Shift+Z" variant="ghost" size="sm" isDisabled>
          <Redo2 />
        </IconButton>
        <ToolbarSeparator />
        <ToggleGroup
          type="multiple"
          size="sm"
          aria-label="Text style"
          value={marks()}
          onChange={setMarks}
        >
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Bold />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Italic />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <Underline />
          </ToggleGroupItem>
        </ToggleGroup>
        <ToolbarSeparator />
        <IconButton label="Insert link" shortcut="Mod+K" variant="ghost" size="sm">
          <Link />
        </IconButton>
      </Toolbar>
      <Text size="sm" color="muted">
        Marks: {marks().join(", ") || "none"}. Tab enters once; the arrows move between controls.
      </Text>

      <Toolbar aria-label="Paragraph" variant="floating">
        <ToggleGroup
          type="single"
          size="sm"
          aria-label="Alignment"
          value={align()}
          onValueChange={(value) =>
            setAlign(typeof value === "string" && value !== "" ? value : "left")
          }
        >
          <ToggleGroupItem value="left" aria-label="Align start">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align centre">
            <AlignCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align end">
            <AlignRight />
          </ToggleGroupItem>
        </ToggleGroup>
        <ToolbarSeparator />
        <IconButton label="Bulleted list" variant="ghost" size="sm">
          <List />
        </IconButton>
        <IconButton label="Numbered list" variant="ghost" size="sm">
          <ListOrdered />
        </IconButton>
      </Toolbar>

      <Toolbar aria-label="Docked actions" variant="docked">
        <IconButton label="Bold" variant="ghost" size="sm">
          <Bold />
        </IconButton>
        <IconButton label="Italic" variant="ghost" size="sm">
          <Italic />
        </IconButton>
        <ToolbarSeparator />
        <IconButton label="Insert link" variant="ghost" size="sm">
          <Link />
        </IconButton>
      </Toolbar>

      <Toolbar aria-label="Vertical tools" orientation="vertical" variant="floating">
        <IconButton label="Undo" variant="ghost" size="sm" tooltipSide="right">
          <Undo2 />
        </IconButton>
        <ToolbarSeparator orientation="horizontal" />
        <IconButton label="Redo" variant="ghost" size="sm" tooltipSide="right">
          <Redo2 />
        </IconButton>
      </Toolbar>
    </Stack>
  );
}
