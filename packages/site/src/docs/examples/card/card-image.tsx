import { css } from "@barqjs/css";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@barqjs/ui";

const card = css`
  margin-inline: auto;
  width: 100%;
  max-width: 24rem;
  overflow: hidden;
  padding-top: 0;
`;

const cover = css`
  aspect-ratio: 16 / 9;
  width: 100%;
  background-image: linear-gradient(
    135deg,
    color-mix(in oklab, var(--foreground) 55%, transparent),
    color-mix(in oklab, var(--foreground) 20%, transparent)
  );
`;

const full = css`
  width: 100%;
`;

export default function CardImage() {
  return (
    <Card class={card}>
      <div role="img" aria-label="Event cover" class={cover} />
      <CardHeader>
        <CardAction>
          <Badge variant="secondary">Featured</Badge>
        </CardAction>
        <CardTitle>Design systems meetup</CardTitle>
        <CardDescription>
          A practical talk on component APIs, accessibility, and shipping faster.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button class={full}>View Event</Button>
      </CardFooter>
    </Card>
  );
}
