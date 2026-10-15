import { css } from "@barqjs/css";
import { AspectRatio } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 12rem;
`;

const ratio = css`
  border-radius: var(--radius-lg);
  background-color: var(--muted);
`;

const picture = css`
  border-radius: var(--radius-lg);
  background-image: linear-gradient(135deg, var(--muted-foreground), var(--muted));
`;

export default function AspectRatioSquare() {
  return (
    <div class={frame}>
      <AspectRatio ratio={1 / 1} class={ratio}>
        <div role="img" aria-label="Photo" class={picture} />
      </AspectRatio>
    </div>
  );
}
