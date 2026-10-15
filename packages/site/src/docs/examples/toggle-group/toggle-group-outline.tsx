import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui";

export default function ToggleGroupOutline() {
  return (
    <ToggleGroup variant="outline" type="single" defaultValue="all" aria-label="Calls">
      <ToggleGroupItem value="all" aria-label="Toggle all">
        All
      </ToggleGroupItem>
      <ToggleGroupItem value="missed" aria-label="Toggle missed">
        Missed
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
