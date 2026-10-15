/**
 * shadcn's `signup-03`, ported from
 * `apps/v4/registry/new-york-v4/blocks/signup-03/`.
 */

import { css } from "@barqjs/css";
import { GalleryVerticalEnd } from "@barqjs/lucide/icons/gallery-vertical-end";
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  background: var(--muted);
  padding: 1.5rem;

  @container preview (width >= 48rem) {
    padding: 2.5rem;
  }
`;

const holder = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: 1.5rem;
`;

const brand = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  align-self: center;
  font-weight: 500;
  color: inherit;
`;

const brandMark = css`
  display: flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--primary-foreground);
`;

const brandIcon = css`
  width: 1rem;
  height: 1rem;
`;

const stack = css`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const cardHeader = css`
  text-align: center;
`;

const cardTitle = css`
  font-size: 1.25rem;
`;

const pair = css`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
`;

const centred = css`
  text-align: center;
`;

const legal = css`
  padding-inline: 1.5rem;
  text-align: center;
`;

export function Signup03() {
  return (
    <div class={page} data-slot="signup-03">
      <div class={holder}>
        <a href="#" class={brand}>
          <div class={brandMark}>
            <GalleryVerticalEnd class={brandIcon} />
          </div>
          Acme Inc.
        </a>
        <div class={stack}>
          <Card>
            <CardHeader class={cardHeader}>
              <CardTitle class={cardTitle}>Create your account</CardTitle>
              <CardDescription>Enter your email below to create your account</CardDescription>
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
                  </Field>
                  <Field>
                    <Field class={pair}>
                      <Field>
                        <FieldLabel for="password">Password</FieldLabel>
                        <Input id="password" type="password" required />
                      </Field>
                      <Field>
                        <FieldLabel for="confirm-password">Confirm Password</FieldLabel>
                        <Input id="confirm-password" type="password" required />
                      </Field>
                    </Field>
                    <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                  </Field>
                  <Field>
                    <Button type="submit">Create Account</Button>
                    <FieldDescription class={centred}>
                      Already have an account? <a href="#">Sign in</a>
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
          <FieldDescription class={legal}>
            By clicking continue, you agree to our <a href="#">Terms of Service</a> and{" "}
            <a href="#">Privacy Policy</a>.
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}
