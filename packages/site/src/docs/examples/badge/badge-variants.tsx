import { css } from "@barqjs/css";
import { Badge } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

export default function BadgeVariants() {
  return (
    <div class={row}>
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
    </div>
  );
}
