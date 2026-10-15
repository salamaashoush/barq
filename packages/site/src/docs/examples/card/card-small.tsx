import { css } from "@barqjs/css";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@barqjs/ui";

const card = css`
  margin-inline: auto;
  width: 100%;
  max-width: 24rem;
`;

const full = css`
  width: 100%;
`;

const text = css`
  margin: 0;
`;

export default function CardSmall() {
  return (
    <Card size="sm" class={card}>
      <CardHeader>
        <CardTitle>Small Card</CardTitle>
        <CardDescription>This card uses the small size variant.</CardDescription>
      </CardHeader>
      <CardContent>
        <p class={text}>
          The card component supports a size prop that can be set to "sm" for a more compact
          appearance.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" class={full}>
          Action
        </Button>
      </CardFooter>
    </Card>
  );
}
