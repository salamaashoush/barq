import { css } from "@barqjs/css";
import { AspectRatio, DirectionProvider } from "@barqjs/ui";

const figure = css`
  width: 100%;
  max-width: 24rem;
  margin: 0;
`;

const ratio = css`
  border-radius: var(--radius-lg);
  background-color: var(--muted);
`;

const picture = css`
  border-radius: var(--radius-lg);
  background-image: linear-gradient(135deg, var(--muted-foreground), var(--muted));
`;

const caption = css`
  margin-top: calc(var(--spacing) * 2);
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function AspectRatioRtl() {
  return (
    <DirectionProvider dir="rtl">
      <figure dir="rtl" class={figure}>
        <AspectRatio ratio={16 / 9} class={ratio}>
          <div role="img" aria-label="Photo" class={picture} />
        </AspectRatio>
        <figcaption class={caption}>منظر طبيعي جميل</figcaption>
      </figure>
    </DirectionProvider>
  );
}
