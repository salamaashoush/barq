import { css } from "@barqjs/css";
import { shimmer, shimmerStyle } from "@barqjs/ui";

const grid = css`
  display: grid;
  width: 100%;
  max-width: 32rem;
  margin-inline: auto;
  gap: calc(var(--spacing) * 6);
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);

  @media (min-width: 40rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const column = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
`;

const caption = css`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
`;

export default function ShimmerSpread() {
  return (
    <div class={grid}>
      <div class={column}>
        <p class={shimmer} style={shimmerStyle({ spread: 4 })}>
          Generating response…
        </p>
        <p class={caption}>{"shimmerStyle({ spread: 4 })"}</p>
      </div>
      <div class={column}>
        <p class={shimmer} style={shimmerStyle({ spread: 24 })}>
          Generating response…
        </p>
        <p class={caption}>{"shimmerStyle({ spread: 24 })"}</p>
      </div>
    </div>
  );
}
