import { For, createSignal } from "@barqjs/core";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/ui";

const frame = css`
  margin-inline: auto;
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 4);
`;

const options = css`
  justify-content: center;
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

interface Spacing {
  readonly value: string;
  readonly label: string;
}

const spacingOptions: readonly Spacing[] = [
  { value: "4", label: "16px" },
  { value: "5", label: "20px" },
  { value: "6", label: "24px" },
  { value: "8", label: "32px" },
];

export default function CardSpacing() {
  const [spacing, setSpacing] = createSignal("4");

  return (
    <div class={frame}>
      <ToggleGroup
        type="single"
        value={spacing()}
        onValueChange={(value: string | string[]) => {
          if (typeof value === "string" && value !== "") setSpacing(value);
        }}
        variant="outline"
        size="sm"
        class={options}
      >
        <For each={() => spacingOptions}>
          {(option: Spacing) => (
            <ToggleGroupItem value={option.value}>{option.label}</ToggleGroupItem>
          )}
        </For>
      </ToggleGroup>
      <Card style={{ "--card-spacing": `calc(var(--spacing) * ${spacing()})` }}>
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
                <Label for="card-spacing-email">Email</Label>
                <Input
                  id="card-spacing-email"
                  type="email"
                  placeholder="salama@example.com"
                  required
                />
              </div>
              <div class={field}>
                <div class={labelRow}>
                  <Label for="card-spacing-password">Password</Label>
                  <a href="#" class={forgot}>
                    Forgot your password?
                  </a>
                </div>
                <Input id="card-spacing-password" type="password" required />
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
    </div>
  );
}
