import { css } from "@barqjs/css";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

export default function ToggleGroupSizes() {
  return (
    <div class={stack}>
      <ToggleGroup type="single" size="sm" defaultValue="top" variant="outline" aria-label="Small">
        <ToggleGroupItem value="top" aria-label="Toggle top">
          Top
        </ToggleGroupItem>
        <ToggleGroupItem value="bottom" aria-label="Toggle bottom">
          Bottom
        </ToggleGroupItem>
        <ToggleGroupItem value="left" aria-label="Toggle left">
          Left
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Toggle right">
          Right
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" defaultValue="top" variant="outline" aria-label="Default">
        <ToggleGroupItem value="top" aria-label="Toggle top">
          Top
        </ToggleGroupItem>
        <ToggleGroupItem value="bottom" aria-label="Toggle bottom">
          Bottom
        </ToggleGroupItem>
        <ToggleGroupItem value="left" aria-label="Toggle left">
          Left
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Toggle right">
          Right
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
