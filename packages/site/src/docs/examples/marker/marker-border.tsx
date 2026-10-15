import { css } from "@barqjs/css";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { GitBranch } from "@barqjs/lucide/icons/git-branch";
import { Search } from "@barqjs/lucide/icons/search";
import { Marker, MarkerContent, MarkerIcon } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  padding-block: calc(var(--spacing) * 12);
`;

export default function MarkerBorder() {
  return (
    <div class={frame}>
      <Marker variant="border">
        <MarkerIcon>
          <GitBranch />
        </MarkerIcon>
        <MarkerContent>Switched to release-candidate</MarkerContent>
      </Marker>
      <Marker variant="border">
        <MarkerIcon>
          <Search />
        </MarkerIcon>
        <MarkerContent>Reviewed 8 related files</MarkerContent>
      </Marker>
      <Marker variant="border">
        <MarkerIcon>
          <FileText />
        </MarkerIcon>
        <MarkerContent>Opened implementation notes</MarkerContent>
      </Marker>
    </div>
  );
}
