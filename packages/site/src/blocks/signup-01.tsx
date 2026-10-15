/**
 * shadcn's `signup-01`, ported from
 * `apps/v4/registry/new-york-v4/blocks/signup-01/`.
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

const legal = css`
  padding-inline: 1.5rem;
  text-align: center;
`;

export function Signup01() {
  return (
    <div class={page} data-slot="signup-01">
      <div class={holder}>
        <Card>
          <CardHeader>
            <CardTitle>Create an account</CardTitle>
            <CardDescription>Enter your information below to create your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form>
              <FieldGroup>
                <Field>
                  <FieldLabel for="name">Full Name</FieldLabel>
                  <Input id="name" type="text" placeholder="John Doe" required />
                </Field>
                <Field>
                  <FieldLabel for="email">Email</FieldLabel>
                  <Input id="email" type="email" placeholder="m@example.com" required />
                  <FieldDescription>
                    We&apos;ll use this to contact you. We will not share your email with anyone
                    else.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel for="password">Password</FieldLabel>
                  <Input id="password" type="password" required />
                  <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel for="confirm-password">Confirm Password</FieldLabel>
                  <Input id="confirm-password" type="password" required />
                  <FieldDescription>Please confirm your password.</FieldDescription>
                </Field>
                <FieldGroup>
                  <Field>
                    <Button type="submit">Create Account</Button>
                    <Button variant="outline" type="button">
                      Sign up with Google
                    </Button>
                    <FieldDescription class={legal}>
                      Already have an account? <a href="#">Sign in</a>
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
