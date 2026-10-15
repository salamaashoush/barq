import { For, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, shimmer, shimmerOnce, shimmerStyle } from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

const text = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function ShimmerOnce() {
  const [run, setRun] = createSignal(0);

  return (
    <div class={stack}>
      <For each={() => [run()]}>
        {() => (
          <p class={`${shimmer} ${shimmerOnce} ${text}`} style={shimmerStyle({ duration: 1100 })}>
            Generating response…
          </p>
        )}
      </For>
      <Button variant="outline" size="sm" onPress={() => setRun((value) => value + 1)}>
        Replay
      </Button>
    </div>
  );
}
