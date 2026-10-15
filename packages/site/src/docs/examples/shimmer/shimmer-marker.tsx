import { css } from "@barqjs/css";
import { Marker, MarkerContent, MarkerIcon, Spinner, shimmer } from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

export default function ShimmerMarker() {
  return (
    <div class={stack}>
      <Marker role="status">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent class={shimmer}>Thinking...</MarkerContent>
      </Marker>
      <Marker variant="separator" role="status">
        <MarkerContent class={shimmer}>Reading 4 files</MarkerContent>
      </Marker>
    </div>
  );
}
