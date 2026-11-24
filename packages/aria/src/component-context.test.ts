/**
 * A locale declared in a component's body reaches what that component renders
 * whichever way the module was compiled.
 *
 * The same source is compiled the three ways an application meets it: a
 * production build and a development build, which both call a component
 * through `createComponent` and differ in what it is told about the call; and
 * the development server's client, which also hands every component of the
 * module out through `hot`.
 * The first fixture is the docs site's right-to-left calendar reduced to its
 * shape: a page declares a locale, renders a provider that hands its children
 * back unbuilt, and a grandchild placed through those children reads both. The
 * locale is a left-to-right one and the provider says right-to-left, so each
 * binding is seen or missed on its own.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { flush } from "@barqjs/core";
import { renderAndHydrate } from "@barqjs/testing";
import { render } from "@barqjs/web";

const require_ = createRequire(import.meta.url);
interface Native {
  transform(code: string, options?: Record<string, unknown>): Transformed;
}

interface Transformed {
  code: string;
}

const native = require_("@barqjs/compiler") as Native;

const SRC = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const CORE = new URL("../node_modules/@barqjs/core/src/index.ts", import.meta.url).pathname;
const HOT = new URL("../node_modules/@barqjs/core/src/hot.ts", import.meta.url).pathname;
const WEB = new URL("../node_modules/@barqjs/web/src/index.ts", import.meta.url).pathname;
const SERVER = new URL("../node_modules/@barqjs/server/src/index.ts", import.meta.url).pathname;

// Inside the package: the fixture imports this package's modules, and
// resolution walks up from where the file is.
const OUT = join(SRC, "..", "node_modules", ".barq-component-context-fixtures");
mkdirSync(OUT, { recursive: true });
let sequence = 0;

type Mode = "production" | "development" | "hot";
const MODES: Mode[] = ["production", "development", "hot"];

type Module = Record<string, (props: Record<string, unknown>) => unknown> & {
  captured?: unknown[];
  localeAt?: (owner: unknown) => string;
  reveal?: () => void;
};

/**
 * What the development server appends to each component declaration (see
 * `withHotComponents` in `@barqjs/vite`), with the module's own hot context
 * standing in for `import.meta.hot`, which a test process does not have.
 */
function withHot(code: string, components: readonly string[]): string {
  const rebound = components
    .map((name) => `${name} = __barq_hot(__barq_context, ${JSON.stringify(name)}, ${name});`)
    .join("\n");
  return (
    `import { hot as __barq_hot } from ${JSON.stringify(HOT)};\n` +
    `const __barq_context = { data: {} };\n${code}\n${rebound}\n`
  );
}

interface CompiledPair {
  client: Module;
  server: Module;
}

/** `source` compiled for `mode`, client and server halves, loaded. */
async function compile(
  source: string,
  mode: Mode,
  components: readonly string[],
): Promise<CompiledPair> {
  const at = sequence++;
  const dev = mode !== "production";
  const common = {
    filename: join(OUT, `fixture-${at}.tsx`),
    moduleSource: WEB,
    coreSource: CORE,
    serverSource: SERVER,
    hydratable: true,
    dev,
  };
  // `.ts`, so the suite's own loader does not compile them a second time.
  const serverFile = join(OUT, `server-${at}.ts`);
  writeFileSync(serverFile, native.transform(source, { ...common, ssr: true }).code);
  const clientFile = join(OUT, `client-${at}.ts`);
  const client = native.transform(source, common).code;
  writeFileSync(clientFile, mode === "hot" ? withHot(client, components) : client);
  return {
    server: (await import(serverFile)) as Module,
    client: (await import(clientFile)) as Module,
  };
}

const unmounts: (() => void)[] = [];

afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
  document.body.textContent = "";
});

function rendered(app: () => unknown): HTMLElement {
  const container = document.body.appendChild(document.createElement("div"));
  unmounts.push(render(app as never, container));
  return container;
}

const COMPONENTS = ["Month", "Direction", "Page", "App"];

const CALENDAR = `
  import { provideDirection, provideLocale, useLocale } from "${SRC}/i18n.ts";

  function Month() {
    const locale = useLocale();
    return <b>{() => locale().locale + " " + locale().direction}</b>;
  }

  function Direction(props) {
    provideDirection("rtl");
    return <>{props.children}</>;
  }

  export function Page() {
    provideLocale("de-DE");
    return (
      <Direction>
        <div>
          <Month />
        </div>
      </Direction>
    );
  }

  export function App() {
    return (
      <main>
        <Page />
      </main>
    );
  }
`;

describe("a locale declared in a page's body reaches a grandchild placed through a provider", () => {
  for (const mode of MODES) {
    test(`${mode}: on a fresh render`, async () => {
      const { client } = await compile(CALENDAR, mode, COMPONENTS);
      const container = rendered(() => client.App!({}));
      expect(container.querySelector("b")?.textContent).toBe("de-DE rtl");
    });

    test(`${mode}: when hydrating the server's markup`, async () => {
      const { client, server } = await compile(CALENDAR, mode, COMPONENTS);
      const result = renderAndHydrate({
        server: () => server.App!({}) as never,
        client: (() => client.App!({})) as never,
      });
      unmounts.push(result.unmount);
      expect(result.html).toContain("de-DE rtl");
      expect(result.container.querySelector("b")?.textContent).toBe("de-DE rtl");
      expect(result.mismatches).toEqual([]);
    });
  }
});

const SCOPES = `
  import { For, Show, createContext, createSignal, getOwner, runWithOwner, useContext } from "${CORE}";
  import { provideLocale, useLocale } from "${SRC}/i18n.ts";

  function Reads(props) {
    const locale = useLocale();
    return <i>{props.name + ":" + locale().locale}</i>;
  }

  function German(props) {
    provideLocale("de-DE");
    return (
      <section>
        <Reads name="inside" />
        {props.children}
      </section>
    );
  }

  function PassThrough(props) {
    provideLocale("de-DE");
    return <>{props.children}</>;
  }

  function Choosing(props) {
    provideLocale("de-DE");
    return <>{props.on ? <Reads name="chosen" /> : null}</>;
  }

  const Theme = createContext("plain");

  function ReadsTheme(props) {
    const theme = useContext(Theme);
    return <i>{props.name + ":" + theme()}</i>;
  }

  export function Descendants() {
    return <main><German /></main>;
  }

  export function Placed() {
    return <main><German><Reads name="placed" /></German></main>;
  }

  export function HandedBack() {
    return <main><PassThrough><Reads name="handed" /></PassThrough></main>;
  }

  export function Chosen() {
    return <main><Choosing on={true} /></main>;
  }

  export function Provided() {
    return (
      <main>
        <Theme value="dark"><ReadsTheme name="inside" /></Theme>
        <ReadsTheme name="after" />
      </main>
    );
  }

  export function Siblings() {
    return <main><German /><Reads name="after" /></main>;
  }

  export function BesideHandedBack() {
    return <main><PassThrough><b /></PassThrough><Reads name="beside" /></main>;
  }

  export function FragmentSiblings() {
    return <><German /><Reads name="after" /></>;
  }

  export function TextSiblings() {
    return <main><German />between<Reads name="after" /></main>;
  }

  function Returned(props) {
    provideLocale("de-DE");
    return () => <Reads name="returned" />;
  }

  export function ReturnsCell() {
    return <main><Returned /><Reads name="after" /></main>;
  }

  const [shown, setShown] = createSignal(true);
  const [rows, setRows] = createSignal(["a"]);

  /** Shows the branch and adds a row, after the page is built. */
  export function reveal() {
    setShown(true);
    setRows(["a", "b"]);
  }

  function GermanLists() {
    provideLocale("de-DE");
    return (
      <section>
        <Show when={shown()}><Reads name="shown" /></Show>
        <For each={rows()}>{(row) => <Reads name={row} />}</For>
      </section>
    );
  }

  export function Lists() {
    return <main><GermanLists /><Reads name="after" /></main>;
  }

  /** Each owner a component body ran under, for what is built under it later. */
  export const captured = [];

  function Capture() {
    captured.push(getOwner());
    return null;
  }

  function GermanCapture() {
    provideLocale("de-DE");
    return <Capture />;
  }

  export function Captured() {
    return <main><GermanCapture /><Capture /></main>;
  }

  export function localeAt(owner) {
    return runWithOwner(owner, () => useLocale()().locale);
  }
`;

const SCOPE_COMPONENTS = [
  "Reads",
  "German",
  "PassThrough",
  "Choosing",
  "ReadsTheme",
  "Descendants",
  "Placed",
  "HandedBack",
  "Chosen",
  "Provided",
  "Siblings",
  "BesideHandedBack",
  "FragmentSiblings",
  "TextSiblings",
  "Returned",
  "ReturnsCell",
  "GermanLists",
  "Lists",
  "Capture",
  "GermanCapture",
  "Captured",
];

function read(container: Element): string[] {
  return [...container.querySelectorAll("i")].map((node) => node.textContent ?? "");
}

/**
 * What each fixture renders. A component's binding reaches what it builds and
 * what it hands back, wherever the caller places that; barq's own provider is
 * here as the reference, since it opens a scope of its own in every mode.
 */
const SEEN: Record<string, string[]> = {
  Descendants: ["inside:de-DE"],
  Placed: ["inside:de-DE", "placed:de-DE"],
  HandedBack: ["handed:de-DE"],
  Chosen: ["chosen:de-DE"],
  Provided: ["inside:dark", "after:plain"],
  ReturnsCell: ["returned:de-DE", "after:en-US"],
  Lists: ["shown:de-DE", "a:de-DE", "after:en-US"],
};

/** A binding a component installs is not its later siblings'. */
const NOT_SEEN: Record<string, string[]> = {
  Siblings: ["inside:de-DE", "after:en-US"],
  BesideHandedBack: ["beside:en-US"],
  FragmentSiblings: ["inside:de-DE", "after:en-US"],
  TextSiblings: ["inside:de-DE", "after:en-US"],
};

/** The markup a server render wrote, read the way a client's is. */
function served(html: string): string[] {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return read(holder);
}

async function check(
  mode: Mode,
  cases: Record<string, string[]>,
  source = SCOPES,
  components: readonly string[] = SCOPE_COMPONENTS,
): Promise<void> {
  const { client, server } = await compile(source, mode, components);
  for (const [name, expected] of Object.entries(cases)) {
    expect(read(rendered(() => client[name]!({}))), `${name}, fresh`).toEqual(expected);

    const result = renderAndHydrate({
      server: () => server[name]!({}) as never,
      client: (() => client[name]!({})) as never,
    });
    unmounts.push(result.unmount);
    expect(served(result.html), `${name}, served`).toEqual(expected);
    expect(read(result.container), `${name}, hydrated`).toEqual(expected);
    expect(result.mismatches, `${name}, hydrated`).toEqual([]);
  }
}

describe("a binding installed in a component's body is seen alike in every compile", () => {
  for (const mode of MODES) {
    test(`${mode}: by what the component builds and hands back`, async () => {
      await check(mode, SEEN);
    });
  }

  for (const mode of MODES) {
    test(`${mode}: not by what is built after it`, async () => {
      await check(mode, NOT_SEEN);
    });

    test(`${mode}: by a branch and a row built after the page`, async () => {
      const { client } = await compile(SCOPES, mode, SCOPE_COMPONENTS);
      const container = rendered(() => client.Lists!({}));
      client.reveal!();
      flush();
      expect(read(container)).toEqual(["shown:de-DE", "a:de-DE", "b:de-DE", "after:en-US"]);
    });

    // An owner a body captured is where a renderer of its own, a canvas,
    // builds what it is handed once it is ready, long after the call returned.
    test(`${mode}: by what is built later under an owner its body ran under`, async () => {
      const { client } = await compile(SCOPES, mode, SCOPE_COMPONENTS);
      rendered(() => client.Captured!({}));
      const [inside, after] = client.captured!;
      expect(client.localeAt!(inside)).toBe("de-DE");
      expect(client.localeAt!(after)).toBe("en-US");
    });
  }
});

const TAGS = `
  import { dynamic } from "${WEB}";
  import { provideLocale, useLocale } from "${SRC}/i18n.ts";

  function Inner(props) {
    provideLocale("de-DE");
    return <i>{"inner" + props.y + ":" + useLocale()().locale}</i>;
  }

  function After() {
    return <i>{"after:" + useLocale()().locale}</i>;
  }

  function Member(props) {
    return <props.component y={1} />;
  }

  function Nested(props) {
    return <props.icons.Left y={2} />;
  }

  function Param({ component: C }) {
    return <C y={3} />;
  }

  function Body(props) {
    const { component: C } = props;
    return <C y={4} />;
  }

  function Defaulted({ component: C = Inner }) {
    return <C y={5} />;
  }

  function Rest({ ...rest }) {
    return <rest.component y={6} />;
  }

  function Middle(props) {
    return <props.component y={7} />;
  }

  function Outer(props) {
    return <Middle component={props.component} />;
  }

  function Hands(props) {
    provideLocale("de-DE");
    return <>{props.children}</>;
  }

  const Chosen = dynamic(() => Hands);

  function Reader(props) {
    return <i>{"read" + props.y + ":" + useLocale()().locale}</i>;
  }

  export function ByMember() {
    return <main><Member component={Inner} /><After /></main>;
  }
  export function ByNested() {
    return <main><Nested icons={{ Left: Inner }} /><After /></main>;
  }
  export function ByParam() {
    return <main><Param component={Inner} /><After /></main>;
  }
  export function ByBody() {
    return <main><Body component={Inner} /><After /></main>;
  }
  export function ByDefault() {
    return <main><Defaulted /><After /></main>;
  }
  export function ByRest() {
    return <main><Rest component={Inner} /><After /></main>;
  }
  export function ByForward() {
    return <main><Outer component={Inner} /><After /></main>;
  }

  export function ByDynamic() {
    return <main><Chosen><Reader y={8} /></Chosen><After /></main>;
  }
`;

const TAG_COMPONENTS = [
  "Inner",
  "After",
  "Member",
  "Nested",
  "Param",
  "Body",
  "Defaulted",
  "Rest",
  "Middle",
  "Outer",
  "Hands",
  "Reader",
  "ByMember",
  "ByNested",
  "ByParam",
  "ByBody",
  "ByDefault",
  "ByRest",
  "ByForward",
  "ByDynamic",
];

/**
 * A tag that names a prop calls the component the prop holds, with the props
 * the tag writes and under a frame of its own, however the prop was named.
 */
const BY_TAG: Record<string, string[]> = {
  ByMember: ["inner1:de-DE", "after:en-US"],
  ByNested: ["inner2:de-DE", "after:en-US"],
  ByParam: ["inner3:de-DE", "after:en-US"],
  ByBody: ["inner4:de-DE", "after:en-US"],
  ByDefault: ["inner5:de-DE", "after:en-US"],
  ByRest: ["inner6:de-DE", "after:en-US"],
  ByForward: ["inner7:de-DE", "after:en-US"],
  ByDynamic: ["read8:de-DE", "after:en-US"],
};

describe("a tag that names a prop renders the component the prop holds", () => {
  for (const mode of MODES) {
    test(`${mode}: with its props, under a frame of its own`, async () => {
      await check(mode, BY_TAG, TAGS, TAG_COMPONENTS);
    });
  }
});
