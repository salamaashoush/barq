import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { GitBranch } from "@barqjs/lucide/icons/git-branch";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { Marker, MarkerContent, MarkerIcon } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

const action = css`
  cursor: pointer;
  transition: color 150ms;

  &:hover {
    color: var(--foreground);
  }
`;

export default function MarkerLinkButton() {
  const [reverted, setReverted] = createSignal(false);

  return (
    <div class={frame}>
      <Marker>
        <MarkerIcon>
          <GitBranch />
        </MarkerIcon>
        <MarkerContent>
          <a href="#links-and-buttons">View the pull request</a>
        </MarkerContent>
      </Marker>
      <Marker>
        <MarkerIcon>
          <RotateCcw />
        </MarkerIcon>
        <MarkerContent>
          <button type="button" class={action} onClick={() => setReverted(true)}>
            {() => (reverted() ? "Change reverted" : "Revert this change")}
          </button>
        </MarkerContent>
      </Marker>
    </div>
  );
}
