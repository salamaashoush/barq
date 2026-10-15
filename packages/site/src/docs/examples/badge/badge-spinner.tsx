import { css } from "@barqjs/css";
import { Badge, Spinner } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

export default function BadgeWithSpinner() {
  return (
    <div class={row}>
      <Badge variant="destructive">
        <Spinner />
        Deleting
      </Badge>
      <Badge variant="secondary">
        Generating
        <Spinner />
      </Badge>
    </div>
  );
}
