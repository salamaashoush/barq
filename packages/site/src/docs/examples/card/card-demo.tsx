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
  Input,
  Label,
} from "@barqjs/ui";

const card = css`
  width: 100%;
  max-width: 24rem;
`;

const fields = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

const field = css`
  display: grid;
  gap: calc(var(--spacing) * 2);
`;

const labelRow = css`
  display: flex;
  align-items: center;
`;

const forgot = css`
  margin-inline-start: auto;
  display: inline-block;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: inherit;
  text-decoration: none;
  text-underline-offset: 4px;

  &:hover {
    text-decoration: underline;
  }
`;

const footer = css`
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const full = css`
  width: 100%;
`;

export default function CardDemo() {
  return (
    <Card class={card}>
      <CardHeader>
        <CardTitle>Login to your account</CardTitle>
        <CardDescription>Enter your email below to login to your account</CardDescription>
        <CardAction>
          <Button variant="link">Sign Up</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event: SubmitEvent) => event.preventDefault()}>
          <div class={fields}>
            <div class={field}>
              <Label for="card-demo-email">Email</Label>
              <Input id="card-demo-email" type="email" placeholder="salama@example.com" required />
            </div>
            <div class={field}>
              <div class={labelRow}>
                <Label for="card-demo-password">Password</Label>
                <a href="#" class={forgot}>
                  Forgot your password?
                </a>
              </div>
              <Input id="card-demo-password" type="password" required />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter class={footer}>
        <Button type="submit" class={full}>
          Login
        </Button>
        <Button variant="outline" class={full}>
          Login with Google
        </Button>
      </CardFooter>
    </Card>
  );
}
