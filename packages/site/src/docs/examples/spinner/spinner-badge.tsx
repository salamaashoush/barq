import { css } from "@barqjs/css";
import { Badge, Spinner } from "@barqjs/ui";

const row = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

export default function SpinnerBadge() {
  return (
    <div class={row}>
      <Badge>
        <Spinner />
        Syncing
      </Badge>
      <Badge variant="secondary">
        <Spinner />
        Updating
      </Badge>
      <Badge variant="outline">
        <Spinner />
        Processing
      </Badge>
    </div>
  );
}
