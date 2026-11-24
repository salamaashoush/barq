import { createSignal } from "@barqjs/core";
import { Inline, Stack, Text, Toggle, ToggleGroup, ToggleGroupItem } from "@barqjs/arc";
import { Bold } from "@barqjs/lucide/icons/bold";
import { Italic } from "@barqjs/lucide/icons/italic";
import { Underline } from "@barqjs/lucide/icons/underline";

export default function Toggles() {
  const [pinned, setPinned] = createSignal(false);
  const [view, setView] = createSignal("board");
  const [days, setDays] = createSignal<string[]>(["mon", "wed", "fri"]);
  return (
    <Stack gap={5}>
      <Inline gap={2} align="center" wrap>
        <Toggle aria-label="Bold">
          <Bold />
        </Toggle>
        <Toggle variant="outline" pressed={pinned()} onPressedChange={setPinned}>
          {pinned() ? "Pinned" : "Pin to top"}
        </Toggle>
        <Toggle size="sm" variant="outline" defaultPressed>
          <Italic />
          Small
        </Toggle>
        <Toggle size="lg" aria-label="Underline">
          <Underline />
        </Toggle>
        <Toggle disabled aria-label="Bold, disabled">
          <Bold />
        </Toggle>
      </Inline>
      <Stack gap={2}>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="View"
          value={view()}
          onValueChange={(value) =>
            setView(typeof value === "string" && value !== "" ? value : view())
          }
        >
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="board">Board</ToggleGroupItem>
          <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
        </ToggleGroup>
        <Text size="sm" color="muted">
          Showing the {view()} view.
        </Text>
      </Stack>
      <Stack gap={2}>
        <ToggleGroup
          type="multiple"
          spacing={1}
          size="sm"
          aria-label="Working days"
          value={days()}
          onChange={setDays}
        >
          <ToggleGroupItem value="mon">Mon</ToggleGroupItem>
          <ToggleGroupItem value="tue">Tue</ToggleGroupItem>
          <ToggleGroupItem value="wed">Wed</ToggleGroupItem>
          <ToggleGroupItem value="thu">Thu</ToggleGroupItem>
          <ToggleGroupItem value="fri">Fri</ToggleGroupItem>
        </ToggleGroup>
        <Text size="sm" color="muted">
          Working on {days().length} days.
        </Text>
      </Stack>
      <Inline gap={6} wrap>
        <ToggleGroup
          type="single"
          orientation="vertical"
          variant="outline"
          defaultValue="day"
          aria-label="Range"
        >
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          disabled
          defaultValue="a"
          aria-label="Locked choice"
          variant="outline"
        >
          <ToggleGroupItem value="a">Locked</ToggleGroupItem>
          <ToggleGroupItem value="b">Choice</ToggleGroupItem>
        </ToggleGroup>
      </Inline>
    </Stack>
  );
}
