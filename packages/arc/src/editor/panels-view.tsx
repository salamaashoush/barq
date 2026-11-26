import { type Child, For, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter } from "@barqjs/aria/i18n";
import { Button } from "@barqjs/ui/button";
import { Card } from "@barqjs/ui/card";
import { type RenderPart } from "@barqjs/ui/slot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@barqjs/ui/tabs";

import { useArcMessages } from "../components/messages.ts";
import { Timeline, type TimelineEvent } from "../components/timeline.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import {
  fg,
  focus,
  gap,
  interaction,
  layout,
  place,
  plainList,
  rounded,
  space,
  type,
} from "../style/index.ts";
import { blockGap } from "./theme.ts";

/** How a set of titled parts reads: tabs, numbered steps, a timeline, cards turned over, or paths chosen between. */
export type PanelLayout = "tabs" | "steps" | "timeline" | "cards" | "choices";

export const PANEL_LAYOUTS: readonly PanelLayout[] = [
  "tabs",
  "steps",
  "timeline",
  "cards",
  "choices",
];

/** The most parts one set holds. */
export const MAX_PANELS = 12;

export function panelLayoutOf(value: unknown): PanelLayout {
  return PANEL_LAYOUTS.find((one) => one === value) ?? "tabs";
}

/** Cards side by side while each keeps a readable width, one under another on a phone. */
export const cardGrid = arc({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 14rem), 1fr))",
});

/** Text a set holds reads as the document around it does, not as a component's small print. */
const documentText = arc(fg.inherit, { fontSize: "inherit", lineHeight: "inherit" });

/** The room between the last block a part holds and its edge, which the part's padding gives instead. */
const lastFlush = arc({ "& > :last-child": { marginBlockEnd: "0px" } });

export const panelsViewStyles = variants({
  slots: {
    root: arc(blockGap, layout.minZero),
    tabList: arc(layout.fill, { overflowX: "auto", justifyContent: "flex-start" }),
    tab: arc({ flex: "0 0 auto" }),
    tabPanel: arc(lastFlush, { paddingBlockStart: space.x3 }),
    title: arc(documentText, type.strong),
    rail: arc(documentText, lastFlush),
    marker: arc(type.numeric),
    cards: arc(plainList, cardGrid, gap[3]),
    cardItem: arc(layout.minZero),
    card: arc({ blockSize: "100%" }),
    front: arc(
      layout.column,
      layout.centre,
      gap[2],
      place.fill,
      rounded.inherit,
      focus.visible,
      interaction.pressable,
      {
        minBlockSize: space.x16,
        padding: space.x4,
        border: "none",
        background: "none",
        color: "inherit",
        font: "inherit",
        textAlign: "center",
      },
    ),
    cardTitle: arc(type.subheading),
    hint: arc(type.meta),
    back: arc(layout.column, gap[3], { paddingInline: "var(--card-spacing)" }),
    body: arc(lastFlush, layout.minZero),
    turnBack: arc({ alignSelf: "flex-start" }),
    choices: arc(plainList, cardGrid, gap[2]),
    choice: arc(layout.fill, {
      blockSize: "auto",
      minBlockSize: space.x10,
      whiteSpace: "normal",
      justifyContent: "flex-start",
      textAlign: "start",
    }),
    path: arc(layout.column, gap[3]),
    chosen: arc(focus.outline, rounded.md, layout.column, gap[2]),
    chosenTitle: arc(type.strong, layout.flush),
    again: arc({ alignSelf: "flex-start" }),
  },
});

export type PanelsViewSlots = ReturnType<typeof panelsViewStyles>;

/** One part of a set: its title and what it holds, each drawn afresh where it is shown. */
export interface PanelItem {
  id: string;
  title: () => Child;
  body: () => Child;
}

/** Other elements for the parts a set draws around the caller's content. */
export interface PanelsViewRenders {
  /** A part's title where it stands as words of its own: a step's, an event's, a card's front, a chosen path's. */
  title?: RenderPart<Child>;
  /** What a part holds. */
  body?: RenderPart<Child>;
}

/** How a set's parts read, whatever draws them: a document's renderer, or an app's own page. */
export interface PanelsLook extends Customisable<PanelsViewSlots> {
  renders?: PanelsViewRenders;
}

export interface PanelsViewProps extends PanelsLook {
  layout: PanelLayout;
  items: readonly PanelItem[];
  /** A step's number in the reader's digits. @default the page's locale */
  formatNumber?: (value: number) => string;
}

interface PartProps {
  item: PanelItem;
  cls: PanelsViewSlots;
  renders: PanelsViewRenders | undefined;
}

interface TitleProps extends PartProps {
  slot: string;
}

function Title(props: TitleProps) {
  const render = props.renders?.title;
  if (render === undefined) {
    return (
      <span class={props.cls.title} data-slot={props.slot} dir="auto">
        {props.item.title()}
      </span>
    );
  }
  return rendered(
    render,
    { class: props.cls.title, "data-slot": props.slot, dir: "auto" },
    props.item.title(),
  );
}

function Body(props: PartProps) {
  const render = props.renders?.body;
  if (render === undefined) {
    return (
      <div class={props.cls.body} data-slot="panels-body">
        {props.item.body()}
      </div>
    );
  }
  return rendered(render, { class: props.cls.body, "data-slot": "panels-body" }, props.item.body());
}

interface SetProps {
  items: readonly PanelItem[];
  cls: PanelsViewSlots;
  root: string;
  renders: PanelsViewRenders | undefined;
}

/** Tabs on ui's `Tabs`: the arrows move in the reading direction, every panel kept in the page. */
function PanelTabs(props: SetProps) {
  return (
    <Tabs
      class={props.root}
      data-slot="panels"
      data-layout="tabs"
      defaultValue={props.items[0]?.id}
    >
      <TabsList variant="line" class={props.cls.tabList} data-slot="panels-tab-list">
        <For each={props.items}>
          {(item: PanelItem) => (
            <TabsTrigger value={item.id} class={props.cls.tab} data-slot="panels-tab" dir="auto">
              {item.title()}
            </TabsTrigger>
          )}
        </For>
      </TabsList>
      <For each={props.items}>
        {(item: PanelItem) => (
          <TabsContent
            value={item.id}
            forceMount
            class={props.cls.tabPanel}
            data-slot="panels-tab-panel"
          >
            {item.body()}
          </TabsContent>
        )}
      </For>
    </Tabs>
  );
}

interface RailProps extends SetProps {
  layout: "steps" | "timeline";
  formatNumber: (value: number) => string;
}

/** Steps and a timeline on arc's `Timeline`: an ordered list down a rail, a step's marker its number. */
function PanelRail(props: RailProps) {
  const events: TimelineEvent[] = props.items.map((item, index) => ({
    id: item.id,
    title: <Title item={item} cls={props.cls} renders={props.renders} slot="panels-title" />,
    description: <Body item={item} cls={props.cls} renders={props.renders} />,
    icon:
      props.layout === "steps" ? (
        <span class={props.cls.marker}>{props.formatNumber(index + 1)}</span>
      ) : undefined,
  }));
  return (
    <div class={props.root} data-slot="panels" data-layout={props.layout}>
      <Timeline classes={{ title: props.cls.rail, description: props.cls.rail }} events={events} />
    </div>
  );
}

/**
 * A card a reader turns over: the front is one button, so what the back
 * holds (links, pictures) is never inside it, and turning moves focus to
 * the side that shows.
 */
function FlipCard(props: PartProps) {
  const messages = useArcMessages();
  const [turned, setTurned] = createSignal(false);
  let front: HTMLButtonElement | undefined;
  let back: HTMLDivElement | undefined;
  function turn(to: boolean): void {
    setTurned(to);
    queueMicrotask(() => (to ? back : front)?.focus());
  }
  return (
    <li class={props.cls.cardItem} data-slot="panels-card" data-turned={turned()}>
      <Card class={props.cls.card}>
        <button
          ref={(element: HTMLButtonElement) => {
            front = element;
          }}
          type="button"
          class={props.cls.front}
          data-slot="panels-card-front"
          hidden={turned()}
          onClick={() => turn(true)}
        >
          <Title item={props.item} cls={props.cls} renders={props.renders} slot="panels-title" />
          <span class={props.cls.hint} data-slot="panels-card-hint">
            {messages().turnCardOver}
          </span>
        </button>
        <div
          ref={(element: HTMLDivElement) => {
            back = element;
          }}
          tabIndex={-1}
          class={props.cls.back}
          data-slot="panels-card-back"
          hidden={!turned()}
        >
          <Body item={props.item} cls={props.cls} renders={props.renders} />
          <Button
            variant="outline"
            size="sm"
            class={props.cls.turnBack}
            data-slot="panels-card-turn-back"
            onPress={() => turn(false)}
          >
            {messages().turnCardBack}
          </Button>
        </div>
      </Card>
    </li>
  );
}

function PanelCards(props: SetProps) {
  return (
    <ul class={arc(props.cls.cards, props.root)} data-slot="panels" data-layout="cards">
      <For each={props.items}>
        {(item: PanelItem) => <FlipCard item={item} cls={props.cls} renders={props.renders} />}
      </For>
    </ul>
  );
}

/**
 * Paths a reader chooses between: each a button, and choosing one shows
 * only the part it leads to, named above it, with a way back to choose
 * again. Focus follows, to what the choice shows and back to the choices.
 */
function PanelChoices(props: SetProps) {
  const messages = useArcMessages();
  const [chosen, setChosen] = createSignal<string | null>(null);
  let list: HTMLUListElement | undefined;
  const shown = new Map<string, HTMLElement>();
  function choose(id: string | null): void {
    setChosen(id);
    queueMicrotask(() => {
      if (id === null) list?.querySelector<HTMLElement>("button")?.focus();
      else shown.get(id)?.focus();
    });
  }
  return (
    <div class={props.root} data-slot="panels" data-layout="choices">
      <ul
        ref={(element: HTMLUListElement) => {
          list = element;
        }}
        class={props.cls.choices}
        data-slot="panels-choices"
        hidden={chosen() !== null}
      >
        <For each={props.items}>
          {(item: PanelItem) => (
            <li>
              <Button
                variant="outline"
                class={props.cls.choice}
                data-slot="panels-choice"
                dir="auto"
                onPress={() => choose(item.id)}
              >
                {item.title()}
              </Button>
            </li>
          )}
        </For>
      </ul>
      <For each={props.items}>
        {(item: PanelItem) => (
          <div class={props.cls.path} data-slot="panels-path" hidden={chosen() !== item.id}>
            <section
              ref={(element: HTMLElement) => {
                shown.set(item.id, element);
              }}
              tabIndex={-1}
              aria-label={messages().chosenPath}
              class={props.cls.chosen}
              data-slot="panels-chosen"
            >
              <Title item={item} cls={props.cls} renders={props.renders} slot="panels-title" />
              <Body item={item} cls={props.cls} renders={props.renders} />
            </section>
            <Button
              variant="outline"
              size="sm"
              class={props.cls.again}
              data-slot="panels-choose-again"
              onPress={() => choose(null)}
            >
              {messages().chooseAgain}
            </Button>
          </div>
        )}
      </For>
    </div>
  );
}

/**
 * A set of titled parts as its reader meets it: tabs on ui's `Tabs`, the
 * arrows following the reading direction; steps and a timeline on arc's
 * `Timeline`, ordered lists down a rail; cards that turn over, the front a
 * button; and paths chosen between, the chosen one shown with a way back.
 * Every part stays in the page, hidden until it shows, so the page's own
 * find and a printed copy have every word.
 *
 * ```tsx
 * <PanelsView layout="steps" items={[{ id: "1", title: () => "Mix", body: () => <p>Flour, then water.</p> }]} />
 * ```
 */
export function PanelsView(props: PanelsViewProps) {
  function cls(): PanelsViewSlots {
    return parts(panelsViewStyles(), props.classes);
  }
  function root(): string {
    return arc(cls().root, props.class, props.className);
  }
  const digits = numberFormatter();
  function number(value: number): string {
    return props.formatNumber === undefined ? digits().format(value) : props.formatNumber(value);
  }
  switch (props.layout) {
    case "steps":
    case "timeline":
      return (
        <PanelRail
          layout={props.layout}
          items={props.items}
          cls={cls()}
          root={root()}
          renders={props.renders}
          formatNumber={number}
        />
      );
    case "cards":
      return <PanelCards items={props.items} cls={cls()} root={root()} renders={props.renders} />;
    case "choices":
      return <PanelChoices items={props.items} cls={cls()} root={root()} renders={props.renders} />;
    default:
      return <PanelTabs items={props.items} cls={cls()} root={root()} renders={props.renders} />;
  }
}
