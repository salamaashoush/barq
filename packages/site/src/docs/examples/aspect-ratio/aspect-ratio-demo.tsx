import { css } from "@barqjs/css";
import { AspectRatio } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 24rem;
`;

const ratio = css`
  border-radius: var(--radius-lg);
  background-color: var(--muted);
`;

const picture = css`
  border-radius: var(--radius-lg);
  background-image: linear-gradient(135deg, var(--muted-foreground), var(--muted));
`;

export default function AspectRatioDemo() {
  return (
    <div class={frame}>
      <AspectRatio ratio={16 / 9} class={ratio}>
        <div role="img" aria-label="Photo" class={picture} />
      </AspectRatio>
    </div>
  );
}
