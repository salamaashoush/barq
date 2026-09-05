/**
 * shadcn's `login-04`, ported from
 * `apps/v4/registry/new-york-v4/blocks/login-04/`.
 *
 * The split card: a form on the left, an image on the right, a rule with "Or
 * continue with" written through it, and three icon buttons under it. Chosen
 * over `login-01` because it is the one that asks a style hard questions — a
 * card with `p-0` whose content is a two-column grid, a `<FieldSeparator>` with
 * CONTENT in it, and a row of icon-only buttons — where the simple card is a
 * card with three inputs in it.
 *
 * The image is a gradient rather than a photograph, because a block in a theme
 * preview should show what the THEME does and a photograph shows what the
 * photograph does. It reads `--muted` and `--primary`, so it moves with the
 * choice like everything else on the page.
 */

import { css } from "@barqjs/css";
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  Input,
} from "@barqjs/ui";

const page = css`
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--muted);
  padding: 1.5rem;

  @container preview (width >= 48rem) {
    padding: 2.5rem;
  }
`;

const holder = css`
  width: 100%;
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  @container preview (width >= 48rem) {
    max-width: 56rem;
  }
`;

/** `overflow-hidden p-0`: the image has to reach the card's own corners. */
const card = css`
  overflow: hidden;
  padding: 0;
`;

const split = css`
  display: grid;
  padding: 0;

  @container preview (width >= 48rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const form = css`
  padding: 1.5rem;

  @container preview (width >= 48rem) {
    padding: 2rem;
  }
`;

const heading = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
`;

const title = css`
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
`;

const lead = css`
  color: var(--muted-foreground);
  text-wrap: balance;
  margin: 0;
`;

const labelRow = css`
  display: flex;
  align-items: center;
`;

const forgot = css`
  margin-left: auto;
  font-size: 0.875rem;
  text-underline-offset: 2px;
  color: inherit;

  &:hover {
    text-decoration-line: underline;
  }
`;

const providers = css`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
`;

const centred = css`
  text-align: center;
`;

const legal = css`
  padding-inline: 1.5rem;
  text-align: center;
`;

/**
 * The right-hand panel.
 *
 * `hidden md:block` upstream, with an `<img>` in it; a container query here for
 * the same reason the rest of the preview uses one, and a gradient in place of
 * the photograph.
 */
const art = css`
  display: none;
  position: relative;
  background:
    radial-gradient(120% 90% at 20% 10%, var(--primary), transparent 60%),
    linear-gradient(160deg, var(--muted), var(--accent));

  @container preview (width >= 48rem) {
    display: block;
  }
`;

/** shadcn's own three, traced from `login-04`'s inline SVGs. */
const APPLE =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";

const GOOGLE =
  "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z";

const META =
  "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z";

export function Login04() {
  return (
    <div class={page} data-slot="login-04">
      <div class={holder}>
        <Card class={card}>
          <CardContent class={split}>
            <form class={form}>
              <FieldGroup>
                <div class={heading}>
                  <h1 class={title}>Welcome back</h1>
                  <p class={lead}>Login to your Acme Inc. account</p>
                </div>
                <Field>
                  <FieldLabel for="login-email">Email</FieldLabel>
                  <Input id="login-email" type="email" placeholder="m@example.com" required />
                </Field>
                <Field>
                  <div class={labelRow}>
                    <FieldLabel for="login-password">Password</FieldLabel>
                    <a href="#" class={forgot}>
                      Forgot your password?
                    </a>
                  </div>
                  <Input id="login-password" type="password" required />
                </Field>
                <Field>
                  <Button type="submit">Login</Button>
                </Field>
                <FieldSeparator>Or continue with</FieldSeparator>
                <Field class={providers}>
                  <Button variant="outline" type="button" aria-label="Login with Apple">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d={APPLE} fill="currentColor" />
                    </svg>
                  </Button>
                  <Button variant="outline" type="button" aria-label="Login with Google">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d={GOOGLE} fill="currentColor" />
                    </svg>
                  </Button>
                  <Button variant="outline" type="button" aria-label="Login with Meta">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d={META} fill="currentColor" />
                    </svg>
                  </Button>
                </Field>
                <FieldDescription class={centred}>
                  Don&apos;t have an account? <a href="#">Sign up</a>
                </FieldDescription>
              </FieldGroup>
            </form>
            <div class={art} aria-hidden="true" />
          </CardContent>
        </Card>
        <FieldDescription class={legal}>
          By clicking continue, you agree to our <a href="#">Terms of Service</a> and{" "}
          <a href="#">Privacy Policy</a>.
        </FieldDescription>
      </div>
    </div>
  );
}
