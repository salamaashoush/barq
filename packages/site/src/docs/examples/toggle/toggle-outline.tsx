import { css } from "@barqjs/css";
import { Bold } from "@barqjs/lucide/icons/bold";
import { Italic } from "@barqjs/lucide/icons/italic";
import { Toggle } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

export default function ToggleOutline() {
  return (
    <div class={row}>
      <Toggle variant="outline" aria-label="Toggle italic">
        <Italic />
        Italic
      </Toggle>
      <Toggle variant="outline" aria-label="Toggle bold">
        <Bold />
        Bold
      </Toggle>
    </div>
  );
}
