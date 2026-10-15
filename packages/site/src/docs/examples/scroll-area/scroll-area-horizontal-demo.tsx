import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ScrollArea, ScrollBar } from "@barqjs/ui";

const area = css`
  width: 24rem;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  white-space: nowrap;
`;

const strip = css`
  display: flex;
  width: max-content;
  gap: calc(var(--spacing) * 4);
  padding: calc(var(--spacing) * 4);
`;

const figure = css`
  margin: 0;
  flex-shrink: 0;
`;

const picture = css`
  width: 18.75rem;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
`;

const dusk = css`
  background: linear-gradient(160deg, oklch(0.78 0.09 60), oklch(0.42 0.11 300));
`;

const shore = css`
  background: linear-gradient(200deg, oklch(0.86 0.06 200), oklch(0.45 0.09 240));
`;

const moss = css`
  background: linear-gradient(140deg, oklch(0.84 0.08 130), oklch(0.4 0.07 160));
`;

const caption = css`
  padding-block-start: calc(var(--spacing) * 2);
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

const artist = css`
  font-weight: 600;
  color: var(--foreground);
`;

interface Artwork {
  readonly artist: string;
  readonly art: string;
}

const works: readonly Artwork[] = [
  { artist: "Salama", art: dusk },
  { artist: "Acme Inc", art: shore },
  { artist: "Acme Studio", art: moss },
];

export default function ScrollAreaHorizontalDemo() {
  return (
    <ScrollArea aria-label="Artwork" class={area}>
      <div class={strip}>
        <For each={() => works}>
          {(artwork: Artwork) => (
            <figure class={figure}>
              <div
                role="img"
                aria-label={`Photo by ${artwork.artist}`}
                class={`${picture} ${artwork.art}`}
              />
              <figcaption class={caption}>
                Photo by <span class={artist}>{artwork.artist}</span>
              </figcaption>
            </figure>
          )}
        </For>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
