/**
 * shadcn's `signup-02`, ported from
 * `apps/v4/registry/new-york-v4/blocks/signup-02/`.
 */

import { css } from "@barqjs/css";
import { GalleryVerticalEnd } from "@barqjs/lucide/icons/gallery-vertical-end";
import {
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  Input,
} from "@barqjs/ui";

const page = css`
  display: grid;
  min-height: 100%;

  @container preview (width >= 64rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const column = css`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;

  @container preview (width >= 48rem) {
    padding: 2.5rem;
  }
`;

const brandRow = css`
  display: flex;
  justify-content: center;
  gap: 0.5rem;

  @container preview (width >= 48rem) {
    justify-content: flex-start;
  }
`;

const brand = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

const centre = css`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const holder = css`
  width: 100%;
  max-width: 20rem;
`;

const form = css`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const heading = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  text-align: center;
`;

const title = css`
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
`;

const lead = css`
  font-size: 0.875rem;
  color: var(--muted-foreground);
  text-wrap: balance;
  margin: 0;
`;

const legal = css`
  padding-inline: 1.5rem;
  text-align: center;
`;

/**
 * `relative hidden bg-muted lg:block` upstream, holding a placeholder image. A
 * gradient over the theme's own tokens stands in for it, so the panel moves
 * with the theme where a photograph would not.
 */
const art = css`
  display: none;
  position: relative;
  background:
    radial-gradient(120% 90% at 20% 10%, var(--primary), transparent 60%),
    linear-gradient(160deg, var(--muted), var(--accent));

  @container preview (width >= 64rem) {
    display: block;
  }
`;

const GITHUB =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

export function Signup02() {
  return (
    <div class={page} data-slot="signup-02">
      <div class={column}>
        <div class={brandRow}>
          <a href="#" class={brand}>
            <div class={brandMark}>
              <GalleryVerticalEnd class={brandIcon} />
            </div>
            Acme Inc.
          </a>
        </div>
        <div class={centre}>
          <div class={holder}>
            <form class={form}>
              <FieldGroup>
                <div class={heading}>
                  <h1 class={title}>Create your account</h1>
                  <p class={lead}>Fill in the form below to create your account</p>
                </div>
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
                <Field>
                  <Button type="submit">Create Account</Button>
                </Field>
                <FieldSeparator>Or continue with</FieldSeparator>
                <Field>
                  <Button variant="outline" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d={GITHUB} fill="currentColor" />
                    </svg>
                    Sign up with GitHub
                  </Button>
                  <FieldDescription class={legal}>
                    Already have an account? <a href="#">Sign in</a>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </div>
        </div>
      </div>
      <div class={art} data-slot="signup-02-cover" aria-hidden="true" />
    </div>
  );
}
