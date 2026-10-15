import { css } from "@barqjs/css";
import { shimmer } from "@barqjs/ui";

const text = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function ShimmerDemo() {
  return <p class={`${shimmer} ${text}`}>Generating response…</p>;
}
