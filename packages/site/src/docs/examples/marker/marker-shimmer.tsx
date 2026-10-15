import { css } from "@barqjs/css";
import { Marker, MarkerContent, shimmer } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

export default function MarkerShimmer() {
  return (
    <div class={frame}>
      <Marker role="status">
        <MarkerContent class={shimmer}>Thinking...</MarkerContent>
      </Marker>
      <Marker variant="separator" role="status">
        <MarkerContent class={shimmer}>Reading 4 files</MarkerContent>
      </Marker>
    </div>
  );
}
