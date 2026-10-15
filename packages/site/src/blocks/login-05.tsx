/**
 * shadcn's `login-05`, ported from
 * `apps/v4/registry/new-york-v4/blocks/login-05/`.
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
  srOnly,
} from "@barqjs/ui";

const page = css`
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  background: var(--background);
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

const heading = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
`;

const brand = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  color: inherit;
`;

const brandMark = css`
  display: flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
`;

const brandIcon = css`
  width: 1.5rem;
  height: 1.5rem;
`;

const title = css`
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
`;

const providers = css`
  display: grid;
  gap: 1rem;

  @container preview (width >= 40rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const legal = css`
  padding-inline: 1.5rem;
  text-align: center;
`;

const APPLE =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";

const GOOGLE =
  "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z";

export function Login05() {
  return (
    <div class={page} data-slot="login-05">
      <div class={holder}>
        <div class={stack}>
          <form>
            <FieldGroup>
              <div class={heading}>
                <a href="#" class={brand}>
                  <div class={brandMark}>
                    <GalleryVerticalEnd class={brandIcon} />
                  </div>
                  <span class={srOnly}>Acme Inc.</span>
                </a>
                <h1 class={title}>Welcome to Acme Inc.</h1>
                <FieldDescription>
                  Don&apos;t have an account? <a href="#">Sign up</a>
                </FieldDescription>
              </div>
              <Field>
                <FieldLabel for="email">Email</FieldLabel>
                <Input id="email" type="email" placeholder="m@example.com" required />
              </Field>
              <Field>
                <Button type="submit">Login</Button>
              </Field>
              <FieldSeparator>Or</FieldSeparator>
              <Field class={providers}>
                <Button variant="outline" type="button">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d={APPLE} fill="currentColor" />
                  </svg>
                  Continue with Apple
                </Button>
                <Button variant="outline" type="button">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d={GOOGLE} fill="currentColor" />
                  </svg>
                  Continue with Google
                </Button>
              </Field>
            </FieldGroup>
          </form>
          <FieldDescription class={legal}>
            By clicking continue, you agree to our <a href="#">Terms of Service</a> and{" "}
            <a href="#">Privacy Policy</a>.
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}
