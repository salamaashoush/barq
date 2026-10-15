import { css } from "@barqjs/css";
import { Badge } from "@barqjs/ui";

const row = css`
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

export default function BadgeDemo() {
  return (
    <div class={row}>
      <Badge>Badge</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  );
}
