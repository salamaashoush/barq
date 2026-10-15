import { css } from "@barqjs/css";
import { shimmer, shimmerNone } from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const caption = css`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
`;

export default function ShimmerNone() {
  return (
    <div class={stack}>
      <p class={`${shimmer} ${shimmerNone}`}>Generating response…</p>
      <p class={caption}>shimmer shimmerNone</p>
    </div>
  );
}
