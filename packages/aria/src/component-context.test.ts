/**
 * A locale declared in a component's body reaches what that component renders
 * whichever way the module was compiled.
 *
 * The same source is compiled the three ways an application meets it: a
 * production build, which calls a component directly; a development build,
 * which calls it through `createComponent`; and the development server's
 * client, which also hands every component of the module out through `hot`.
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

import { renderAndHydrate } from "@barqjs/testing";
import { render } from "@barqjs/web";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

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

type Module = Record<string, (props: Record<string, unknown>) => unknown>;

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

/** `source` compiled for `mode`, client and server halves, loaded. */
async function compile(
  source: string,
  mode: Mode,
  components: readonly string[],
): Promise<{ client: Module; server: Module }> {
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
  import { createContext, useContext } from "@barqjs/core";
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
];

const read = (container: Element): string[] =>
  [...container.querySelectorAll("i")].map((node) => node.textContent ?? "");

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
};

/** A binding a component installs is not its later siblings'. */
const NOT_SEEN: Record<string, string[]> = {
  Siblings: ["inside:de-DE", "after:en-US"],
  BesideHandedBack: ["beside:en-US"],
};

async function check(mode: Mode, cases: Record<string, string[]>): Promise<void> {
  const { client, server } = await compile(SCOPES, mode, SCOPE_COMPONENTS);
  for (const [name, expected] of Object.entries(cases)) {
    expect(read(rendered(() => client[name]!({}))), `${name}, fresh`).toEqual(expected);

    const result = renderAndHydrate({
      server: () => server[name]!({}) as never,
      client: (() => client[name]!({})) as never,
    });
    unmounts.push(result.unmount);
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

  // A production compile calls a component directly, with no frame of its
  // own, so there its body installs on the caller's owner.
  for (const mode of ["development", "hot"] as const) {
    test(`${mode}: not by what is built after it`, async () => {
      await check(mode, NOT_SEEN);
    });
  }
});
