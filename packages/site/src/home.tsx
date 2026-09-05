import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Link } from "@barqjs/router";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Progress,
  Separator,
  Slider,
  Switch,
} from "@barqjs/ui";

import { STYLES } from "./options.ts";

const page = css`
  --edge: 1.5rem;

  @media (width >= 64rem) {
    --edge: 2.5rem;
  }
`;

/**
 * The hero, which is a page-wide band rather than a column.
 *
 * A component library's front door has one job: show that the components are
 * real and that they change with the theme. So the type is on the left and
 * live components are on the right — not a screenshot of them, the same
 * elements every other page uses, wearing whatever style the URL asks for.
 */
const hero = css`
  display: grid;
  gap: 3rem;
  align-items: center;
  padding: 4rem var(--edge) 3rem;
  max-width: 84rem;
  margin-inline: auto;

  @media (width >= 64rem) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 26rem);
    padding-block: 6rem 4rem;
  }
`;

const pitch = css`
  display: grid;
  gap: 1.5rem;
  justify-items: start;
`;

const eyebrow = css`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
`;

const title = css`
  margin: 0;
  font-size: clamp(2.5rem, 6vw, 4.25rem);
  line-height: 1.02;
  letter-spacing: -0.04em;
  font-weight: 600;
  text-wrap: balance;
`;

/**
 * The one flourish on the page.
 *
 * `background-clip: text` over a gradient built from the THEME's own ramp, so
 * the accent on the front door is the accent the customizer is setting rather
 * than a colour picked here and left behind when the theme changes.
 */
const accent = css`
  background-image: linear-gradient(
    100deg,
    var(--chart-1) 0%,
    var(--chart-3) 45%,
    var(--chart-5) 100%
  );
  background-clip: text;
  color: transparent;
`;

const lede = css`
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.6;
  color: var(--muted-foreground);
  max-width: 34rem;
  text-wrap: pretty;
`;

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
`;

const plain = css`
  text-decoration: none;
  color: inherit;
`;

const figures = css`
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  padding-top: 0.5rem;
`;

const figure = css`
  display: grid;
  gap: 0.125rem;
`;

const figureValue = css`
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
`;

const figureLabel = css`
  font-size: 0.8125rem;
  color: var(--muted-foreground);
`;

/** The live panel: real controls, stacked, so the theme is visible at a glance. */
const specimen = css`
  display: grid;
  gap: 1rem;
`;

const field = css`
  display: grid;
  gap: 0.5rem;
`;

const between = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const people = css`
  display: flex;

  & > * + * {
    margin-left: -0.5rem;
  }
`;

const section = css`
  padding: 0 var(--edge) 4rem;
  max-width: 84rem;
  margin-inline: auto;
  display: grid;
  gap: 1.25rem;
`;

const sectionHead = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const sectionTitle = css`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
`;

const sectionNote = css`
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.875rem;
`;

const cards = css`
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
`;

const cardLink = css`
  text-decoration: none;
  color: inherit;
  display: block;
  transition: transform 120ms ease;

  &:hover {
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 4px;
    border-radius: calc(var(--radius) + 4px);
  }
`;

const styleGrid = css`
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
`;

const styleCard = css`
  display: grid;
  gap: 0.25rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 4px);
  background-color: var(--card);
  text-decoration: none;
  color: inherit;

  &:hover {
    background-color: var(--accent);
  }
`;

const styleName = css`
  font-weight: 500;
  font-size: 0.9375rem;
`;

const styleNote = css`
  font-size: 0.8125rem;
  color: var(--muted-foreground);
`;

const FIGURES = [
  { value: "60", label: "components" },
  { value: "8", label: "styles" },
  { value: "3,611", label: "declarations verified" },
  { value: "0", label: "runtime CSS-in-JS" },
];

const DESTINATIONS = [
  {
    to: "/docs/components",
    title: "Components",
    body: "Every component on one page, in every state a style can select on.",
  },
  {
    to: "/blocks",
    title: "Blocks",
    body: "Whole pages — a dashboard, a sidebar, a login — each at its own address.",
  },
  {
    to: "/charts/area",
    title: "Charts",
    body: "Area, bar, line, pie, radar and radial, on TanStack Charts.",
  },
  {
    to: "/colors",
    title: "Colors",
    body: "Every token, resolved against the theme the page is actually wearing.",
  },
];

export function Home() {
  return (
    <div class={page}>
      <section class={hero}>
        <div class={pitch}>
          <span class={eyebrow}>
            <Badge variant="secondary">Alpha</Badge>
            shadcn/ui, ported to barq
          </span>
          <h1 class={title}>
            The components you know,
            <br />
            <span class={accent}>compiled away</span>.
          </h1>
          <p class={lede}>
            Every rule is transcribed from upstream&rsquo;s own class lists, so the look is
            shadcn&rsquo;s rather than an approximation of it. The reactivity is compiled, the
            styles are static, and nothing ships a runtime style engine.
          </p>
          <div class={row}>
            <Link to="/create" class={plain}>
              <Button size="lg">
                Open the designer
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/docs/components" class={plain}>
              <Button size="lg" variant="outline">
                Browse the components
              </Button>
            </Link>
          </div>
          <div class={figures}>
            <For each={() => FIGURES}>
              {(each: (typeof FIGURES)[number]) => (
                <div class={figure}>
                  <span class={figureValue}>{each.value}</span>
                  <span class={figureLabel}>{each.label}</span>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Not a screenshot. The same components every other page renders, so
            the front door changes with the style the URL asks for and a broken
            token shows up here first. */}
        <Card>
          <CardHeader>
            <CardTitle>Deployment</CardTitle>
            <CardDescription>Push to production when the checks pass.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class={specimen}>
              <div class={field}>
                <Label for="home-project">Project</Label>
                <Input id="home-project" value="acme-web" />
              </div>
              <div class={between}>
                <Label for="home-preview">Preview deployments</Label>
                <Switch id="home-preview" defaultSelected />
              </div>
              <div class={field}>
                <div class={between}>
                  <Label>Build concurrency</Label>
                  <span class={styleNote}>4</span>
                </div>
                <Slider aria-label="Build concurrency" defaultValue={50} />
              </div>
              <Separator />
              <div class={between}>
                <span class={styleNote}>Rollout</span>
                <span class={styleNote}>72%</span>
              </div>
              <Progress value={72} />
              <div class={between}>
                <div class={people}>
                  <Avatar>
                    <AvatarFallback>SA</AvatarFallback>
                  </Avatar>
                  <Avatar>
                    <AvatarFallback>MK</AvatarFallback>
                  </Avatar>
                  <Avatar>
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                </div>
                <div class={row}>
                  <Checkbox id="home-notify" defaultSelected />
                  <Label for="home-notify">Notify me</Label>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button>Deploy</Button>
          </CardFooter>
        </Card>
      </section>

      <section class={section}>
        <div class={sectionHead}>
          <h2 class={sectionTitle}>Everything in here</h2>
          <p class={sectionNote}>Each one is a page, not a tab.</p>
        </div>
        <div class={cards}>
          <For each={() => DESTINATIONS}>
            {(each: (typeof DESTINATIONS)[number]) => (
              <Link to={each.to} class={cardLink}>
                <Card>
                  <CardHeader>
                    <CardTitle>{each.title}</CardTitle>
                    <CardDescription>{each.body}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
          </For>
        </div>
      </section>

      <section class={section}>
        <div class={sectionHead}>
          <h2 class={sectionTitle}>Eight styles, one set of components</h2>
          <p class={sectionNote}>
            A style is a stylesheet, and `barq-ui init --style x` writes exactly one.
          </p>
        </div>
        <div class={styleGrid}>
          <For each={() => STYLES.filter((style) => style.value !== "none")}>
            {(style: (typeof STYLES)[number]) => (
              <a class={styleCard} href={`/?style=${style.value}`}>
                <span class={styleName}>{style.label}</span>
                <span class={styleNote}>{style.description}</span>
              </a>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
