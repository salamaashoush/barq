import { css } from "@barqjs/css";
import { Card, CardContent, CardHeader, Skeleton } from "@barqjs/ui";

const card = css`
  width: 100%;
  max-width: 20rem;
`;

const title = css`
  width: 66.666667%;
  height: calc(var(--spacing) * 4);
`;

const subtitle = css`
  width: 50%;
  height: calc(var(--spacing) * 4);
`;

const media = css`
  width: 100%;
  aspect-ratio: 16 / 9;
`;

export default function SkeletonCard() {
  return (
    <Card class={card}>
      <CardHeader>
        <Skeleton class={title} />
        <Skeleton class={subtitle} />
      </CardHeader>
      <CardContent>
        <Skeleton class={media} />
      </CardContent>
    </Card>
  );
}
