import { css } from "@barqjs/css";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@barqjs/ui";

const card = css`
  width: 100%;
  max-width: 24rem;
`;

const text = css`
  margin: 0;
`;

export default function CardBordered() {
  return (
    <Card class={card}>
      <CardHeader bordered>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>Everything billed this year.</CardDescription>
        <CardAction>
          <Button size="sm">New</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p class={text}>Twelve invoices, all paid.</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">
          Export
        </Button>
      </CardFooter>
    </Card>
  );
}
