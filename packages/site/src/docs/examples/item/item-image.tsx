import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

const cover = css`
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--muted), var(--muted-foreground));
`;

const album = css`
  color: var(--muted-foreground);
`;

const duration = css`
  flex: none;
  text-align: center;
`;

interface Song {
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly duration: string;
}

const music: readonly Song[] = [
  {
    title: "Midnight City Lights",
    artist: "Neon Dreams",
    album: "Electric Nights",
    duration: "3:45",
  },
  {
    title: "Coffee Shop Conversations",
    artist: "The Morning Brew",
    album: "Urban Stories",
    duration: "4:05",
  },
  {
    title: "Digital Rain",
    artist: "Cyber Symphony",
    album: "Binary Beats",
    duration: "3:30",
  },
];

export default function ItemImage() {
  return (
    <div class={stack}>
      <ItemGroup>
        <For each={() => music}>
          {(song: Song) => (
            <Item variant="outline" href="#" role="listitem">
              <ItemMedia variant="image">
                <div class={cover} aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {song.title} - <span class={album}>{song.album}</span>
                </ItemTitle>
                <ItemDescription>{song.artist}</ItemDescription>
              </ItemContent>
              <ItemContent class={duration}>
                <ItemDescription>{song.duration}</ItemDescription>
              </ItemContent>
            </Item>
          )}
        </For>
      </ItemGroup>
    </div>
  );
}
