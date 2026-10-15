import { css } from "@barqjs/css";
import { BookOpenCheck } from "@barqjs/lucide/icons/book-open-check";
import { GitBranch } from "@barqjs/lucide/icons/git-branch";
import { Search } from "@barqjs/lucide/icons/search";
import { Marker, MarkerContent, MarkerIcon } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 12);
  padding-block: calc(var(--spacing) * 12);
`;

const stacked = css`
  flex-direction: column;
`;

export default function MarkerIconDemo() {
  return (
    <div class={frame}>
      <Marker>
        <MarkerIcon>
          <GitBranch />
        </MarkerIcon>
        <MarkerContent>Switched to a new branch</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerIcon>
          <Search />
        </MarkerIcon>
        <MarkerContent>Explored 4 files</MarkerContent>
      </Marker>
      <Marker class={stacked}>
        <MarkerIcon>
          <BookOpenCheck />
        </MarkerIcon>
        <MarkerContent>Syncing completed</MarkerContent>
      </Marker>
    </div>
  );
}
