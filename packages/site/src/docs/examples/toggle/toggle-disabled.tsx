import { css } from "@barqjs/css";
import { Toggle } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

export default function ToggleDisabled() {
  return (
    <div class={row}>
      <Toggle aria-label="Toggle disabled" disabled>
        Disabled
      </Toggle>
      <Toggle variant="outline" aria-label="Toggle disabled outline" disabled>
        Disabled
      </Toggle>
    </div>
  );
}
