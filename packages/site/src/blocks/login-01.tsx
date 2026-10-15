/**
 * shadcn's `login-01`, ported from
 * `apps/v4/registry/new-york-v4/blocks/login-01/`.
 */

import { css } from "@barqjs/css";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
} from "@barqjs/ui";

const page = css`
  display: flex;
  min-height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;

  @container preview (width >= 48rem) {
    padding: 2.5rem;
  }
`;

const holder = css`
  width: 100%;
  max-width: 24rem;
`;

const stack = css`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const labelRow = css`
  display: flex;
  align-items: center;
`;

const forgot = css`
  margin-left: auto;
  display: inline-block;
  font-size: 0.875rem;
  text-underline-offset: 4px;
  color: inherit;

  &:hover {
    text-decoration-line: underline;
  }
`;

const centred = css`
  text-align: center;
`;

export function Login01() {
  return (
    <div class={page} data-slot="login-01">
      <div class={holder}>
        <div class={stack}>
          <Card>
            <CardHeader>
              <CardTitle>Login to your account</CardTitle>
              <CardDescription>Enter your email below to login to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <form>
                <FieldGroup>
                  <Field>
                    <FieldLabel for="email">Email</FieldLabel>
                    <Input id="email" type="email" placeholder="m@example.com" required />
                  </Field>
                  <Field>
                    <div class={labelRow}>
                      <FieldLabel for="password">Password</FieldLabel>
                      <a href="#" class={forgot}>
                        Forgot your password?
                      </a>
                    </div>
                    <Input id="password" type="password" required />
                  </Field>
                  <Field>
                    <Button type="submit">Login</Button>
                    <Button variant="outline" type="button">
                      Login with Google
                    </Button>
                    <FieldDescription class={centred}>
                      Don&apos;t have an account? <a href="#">Sign up</a>
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
