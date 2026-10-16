/**
 * One component's page, which is upstream's `/docs/components/[base]/[name]`.
 *
 * Their order, and it is the order because it answers the three questions in
 * the order they are asked: what does it look like, how do I get it, how do I
 * use it. So the hero preview comes before the `## Installation` block, and the
 * variants come after `## Usage` with one card each.
 */

import { For, dynamic, type Child, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowLeft } from "@barqjs/lucide/icons/arrow-left";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Link, useParams } from "@barqjs/router";
import { Button, Empty, Toaster } from "@barqjs/ui";

import { anchor, DocsPage, slugOf, type DocsSection, type RailEntry } from "../docs.tsx";
import { CodeBlock, CommandTabs } from "./code.tsx";
import { COMPONENTS, docNamed } from "./index.ts";
import { ComponentPreview } from "./preview.tsx";
import { addName, type ComponentDoc, type Demo } from "./registry.ts";
import { typeset } from "./typeset.ts";

/** `docs-nav flex items-center gap-2` — the pair beside the title. */
const nav = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

/** `size-8 shadow-none md:size-7`. */
const navButton = css`
  width: calc(var(--spacing) * 8);
  height: calc(var(--spacing) * 8);
  box-shadow: none;

  @media (width >= 48rem) {
    width: calc(var(--spacing) * 7);
    height: calc(var(--spacing) * 7);
  }
`;

/** `hidden h-16 w-full items-center gap-2 sm:flex` — the pair at the foot. */
const footNav = css`
  display: none;
  height: calc(var(--spacing) * 16);
  width: 100%;
  align-items: center;
  gap: calc(var(--spacing) * 2);

  @media (width >= 40rem) {
    display: flex;
  }
`;

const toEnd = css`
  margin-inline-start: auto;
`;

const plain = css`
  text-decoration: none;
  color: inherit;
`;

/** `typeset w-full flex-1 pb-16` — the prose the demos sit in. */
const prose = css`
  width: 100%;
  flex: 1;
  padding-bottom: calc(var(--spacing) * 16);

  @media (width >= 40rem) {
    padding-bottom: 0;
  }
`;

/**
 * A note's inline code, which is the only markdown a note uses.
 *
 * Nine of them name a prop or an element in backticks and every one rendered
 * the backticks literally — `` `bordered` puts a rule under the header ``, on
 * the page. Backticks are all this handles: a note that wants a link or a bold
 * span is a note that wants to be a section.
 */
function Prose(props: Incoming<{ text: string }>) {
  const parts = (): readonly { text: string; code: boolean }[] =>
    props
      .text()
      .split("`")
      .map((text, at) => ({ text, code: at % 2 === 1 }))
      .filter((part) => part.text !== "");

  return (
    <For each={parts}>
      {(part: { text: string; code: boolean }) =>
        part.code ? <code>{part.text}</code> : part.text
      }
    </For>
  );
}

function DemoSection(props: Incoming<{ demo: Demo }>) {
  const Example = dynamic(() => props.demo().component);
  return (
    <>
      {props.demo().title === undefined ? null : (
        <h2 class={anchor} id={slugOf(props.demo().title ?? "")}>
          {props.demo().title}
        </h2>
      )}
      {props.demo().note === undefined ? null : (
        <p>
          <Prose text={() => props.demo().note ?? ""} />
        </p>
      )}
      <ComponentPreview
        code={props.demo().code}
        align={props.demo().align}
        size={props.demo().size}
        rtl={props.demo().rtl}
      >
        <Example />
      </ComponentPreview>
    </>
  );
}

/** Every component, for the rail, with the one being read marked. */
function railFor(slug: string): readonly RailEntry[] {
  return COMPONENTS.map((entry) => ({
    to: `/docs/components/${entry.slug}`,
    label: entry.title,
    current: entry.slug === slug,
  }));
}

/**
 * The right-hand column: `Installation`, `Usage`, then one entry per demo that
 * has a heading. The hero preview has none, which is why it is skipped rather
 * than named — upstream's table of contents starts at `Installation` too.
 */
function sectionsFor(entry: ComponentDoc): readonly DocsSection[] {
  return [
    ...(addName(entry) === undefined ? [] : [{ id: "installation", label: "Installation" }]),
    { id: "usage", label: "Usage" },
    ...entry.demos
      .filter((demo) => demo.title !== undefined)
      .map((demo) => ({ id: slugOf(demo.title ?? ""), label: demo.title ?? "" })),
  ];
}

function neighbours(slug: string): { previous?: ComponentDoc; next?: ComponentDoc } {
  const at = COMPONENTS.findIndex((entry) => entry.slug === slug);
  if (at === -1) return {};
  return { previous: COMPONENTS[at - 1], next: COMPONENTS[at + 1] };
}

function Actions(props: Incoming<{ slug: string }>) {
  const around = (): { previous?: ComponentDoc; next?: ComponentDoc } => neighbours(props.slug());
  return (
    <div class={nav}>
      {() =>
        around().previous === undefined ? null : (
          <Link to={`/docs/components/${around().previous?.slug ?? ""}`} class={plain}>
            <Button variant="secondary" size="icon" class={navButton} aria-label="Previous">
              <ArrowLeft />
            </Button>
          </Link>
        )
      }
      {() =>
        around().next === undefined ? null : (
          <Link to={`/docs/components/${around().next?.slug ?? ""}`} class={plain}>
            <Button variant="secondary" size="icon" class={navButton} aria-label="Next">
              <ArrowRight />
            </Button>
          </Link>
        )
      }
    </div>
  );
}

function Found(props: Incoming<{ entry: ComponentDoc }>) {
  const entry = (): ComponentDoc => props.entry();
  const hero = (): Demo | undefined => entry().demos[0];
  const Hero = dynamic(() => hero()?.component);
  const rest = (): readonly Demo[] => entry().demos.slice(1);
  const around = (): { previous?: ComponentDoc; next?: ComponentDoc } => neighbours(entry().slug);

  return (
    <DocsPage
      title={() => entry().title}
      lede={() => entry().description}
      rail={() => railFor(entry().slug)}
      sections={() => sectionsFor(entry())}
      actions={<Actions slug={() => entry().slug} />}
    >
      <div class={`${typeset} ${prose}`}>
        {() =>
          hero() === undefined ? null : (
            <ComponentPreview
              code={() => hero()?.code ?? ""}
              align={() => hero()?.align}
              size={() => hero()?.size}
              rtl={() => hero()?.rtl}
            >
              <Hero />
            </ComponentPreview>
          )
        }

        {() =>
          addName(entry()) === undefined ? null : (
            <>
              <h2 class={anchor} id="installation">
                Installation
              </h2>
              <CommandTabs command={() => `@barqjs/ui-cli add ${addName(entry()) ?? ""}`} />
            </>
          )
        }

        <h2 class={anchor} id="usage">
          Usage
        </h2>
        <CodeBlock code={() => entry().usage} />

        <For each={rest}>{(demo: Demo) => <DemoSection demo={() => demo} />}</For>
      </div>

      <div class={footNav}>
        {() =>
          around().previous === undefined ? null : (
            <Link to={`/docs/components/${around().previous?.slug ?? ""}`} class={plain}>
              <Button variant="secondary" size="sm">
                <ArrowLeft />
                {around().previous?.title}
              </Button>
            </Link>
          )
        }
        {() =>
          around().next === undefined ? null : (
            <Link to={`/docs/components/${around().next?.slug ?? ""}`} class={`${plain} ${toEnd}`}>
              <Button variant="secondary" size="sm">
                {around().next?.title}
                <ArrowRight />
              </Button>
            </Link>
          )
        }
      </div>
      <Toaster />
    </DocsPage>
  );
}

export function ComponentDocPage(): Child {
  const params = useParams();
  const entry = (): ComponentDoc | undefined => docNamed(params().name ?? "");

  return (
    <>
      {() =>
        entry() === undefined ? (
          <DocsPage
            title="No such component"
            lede="Nothing in this package answers to that name."
            rail={() => railFor("")}
            sections={() => []}
          >
            <Empty>
              <Link to="/docs/components" class={plain}>
                <Button variant="outline">Back to the components</Button>
              </Link>
            </Empty>
          </DocsPage>
        ) : (
          <Found entry={() => entry() as ComponentDoc} />
        )
      }
    </>
  );
}
