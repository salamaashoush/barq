import { css } from "@barqjs/css";
import { shimmer, shimmerStyle } from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function ShimmerColor() {
  return (
    <div class={stack}>
      <p class={shimmer} style={shimmerStyle({ color: "oklch(62.3% 0.214 259.815)", opacity: 60 })}>
        Generating response…
      </p>
      <p class={shimmer} style={shimmerStyle({ color: "#378ADD" })}>
        Generating response…
      </p>
    </div>
  );
}
