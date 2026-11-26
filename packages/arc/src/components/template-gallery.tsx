import { type Child, For, Show, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import { Skeleton } from "@barqjs/ui/skeleton";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, fg, gap, layout, place, rounded, space, surface, type } from "../style/index.ts";
import { type ChoiceOption, RadioCards } from "./choice-cards.tsx";
import { Chip } from "./chip.tsx";
import { EmptyState } from "./empty-state.tsx";
import { FormDialog } from "./form-dialog.tsx";
import { type FieldOption, useArcForm } from "./form.tsx";
import { useArcMessages } from "./messages.ts";

/** Something to start from: a document's shape, a page, a list with its columns. */
export interface TemplateItem {
  key: string;
  name: string;
  description?: string;
  /** The key of the category it is filed under. */
  category?: string;
  /** Drawn small across the top of its card. Decorative: the name names it. */
  thumbnail?: Child;
  /** Drawn large in the preview pane. @default the thumbnail */
  preview?: Child;
}

export interface TemplateCategory {
  key: string;
  label: string;
}

/** The key the blank start is chosen under. */
export const BLANK_TEMPLATE = "__arc-blank";

export const templateGalleryStyles = variants({
  slots: {
    root: arc(layout.container, layout.minZero, layout.column, gap[4]),
    filters: arc(layout.row, layout.wrap, gap[2]),
    body: arc(layout.minZero, layout.track, gap[4], {
      gridTemplateColumns: { [on.cqLg]: "minmax(0, 1fr) 18rem" },
      alignItems: "flex-start",
    }),
    cards: arc(layout.minZero),
    pane: arc(surface.card, layout.column, gap[3], {
      padding: space.x4,
      [on.cqLg]: { position: "sticky", insetBlockStart: space.x4 },
    }),
    preview: arc(bg.muted, rounded.md, layout.clip, edge.all, place.media, {
      aspectRatio: "4 / 3",
    }),
    paneName: arc(type.subheading),
    paneDescription: arc(type.body, fg.muted),
    hint: arc(type.sm, fg.muted, layout.flush),
    start: arc({ alignSelf: "flex-start" }),
    skeleton: arc(rounded.lg, { blockSize: space.x16 }),
    skeletons: arc(layout.minZero, gap[3], {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(min(14rem, 100%), 1fr))",
    }),
  },
});

export type TemplateGallerySlots = ReturnType<typeof templateGalleryStyles>;

/** The blank start's card, in the caller's words. */
export interface BlankTemplate {
  name?: string;
  description?: string;
}

export interface TemplateGalleryProps extends Customisable<TemplateGallerySlots> {
  /** Names the gallery and its cards: `"Templates"`. */
  label: string;
  templates: readonly TemplateItem[];
  /** A chip per category, after All, filtering the cards. */
  categories?: readonly TemplateCategory[];
  /** The category shown, `null` for all: the caller's. */
  category?: string | null;
  defaultCategory?: string | null;
  onCategoryChange?: (category: string | null) => void;
  /** The chosen template's key, `BLANK_TEMPLATE` for the blank start: the caller's. */
  selected?: string | null;
  defaultSelected?: string | null;
  onSelectedChange?: (key: string | null) => void;
  /** A card first that starts from nothing. */
  blank?: boolean | BlankTemplate;
  /** Starts from the chosen template, `null` for the blank start. */
  onStart: (template: TemplateItem | null) => void;
  /** Names the cards, above them. @default "Start from" */
  cardsLabel?: string;
  /** The start button's words. @default "Use this template" */
  startLabel?: string;
  /** The narrowest a card gets. @default "12rem" */
  minCardWidth?: string;
  /** The shape of each card's thumbnail. @default "16 / 9" */
  thumbnailRatio?: string;
  /** Shapes in place of the cards while the templates load. */
  loading?: boolean;
  id?: string;
}

/**
 * Where something new starts: a gallery of templates filed by category, the
 * chosen one shown large beside them, and a button that starts from it. A
 * document's templates, a site's starter pages, a list's shapes.
 *
 * ```tsx
 * <TemplateGallery label="Templates" blank categories={[{ key: "plans", label: "Plans" }]}
 *   templates={templates} onStart={(template) => create(template?.key)} />
 * ```
 *
 * The cards are `RadioCards`, one Tab stop whose arrows choose; the category
 * chips are toggle buttons, one pressed at a time; the pane beside the cards
 * (under them in a narrow box) says what the chosen one is and starts it.
 * `SaveTemplateDialog` keeps something as a template.
 */
export function TemplateGallery(props: TemplateGalleryProps) {
  const messages = useArcMessages();
  const paneId = createUniqueId();
  const [category, setCategory] = controllable<string | null>(
    () => props.category,
    () => untrack(() => props.defaultCategory) ?? null,
    (next) => props.onCategoryChange?.(next),
  );
  const [selected, setSelected] = controllable<string | null>(
    () => props.selected,
    () => untrack(() => props.defaultSelected) ?? null,
    (next) => props.onSelectedChange?.(next),
  );
  function cls(): TemplateGallerySlots {
    return parts(templateGalleryStyles(), props.classes);
  }
  function blank(): BlankTemplate | undefined {
    if (props.blank === undefined || props.blank === false) return undefined;
    return props.blank === true ? {} : props.blank;
  }
  function shown(): readonly TemplateItem[] {
    const only = category();
    return only === null
      ? props.templates
      : props.templates.filter((template) => template.category === only);
  }
  function options(): readonly ChoiceOption[] {
    const empty = blank();
    return [
      ...(empty === undefined
        ? []
        : [
            {
              value: BLANK_TEMPLATE,
              label: empty.name ?? messages().blankTemplate,
              description: empty.description ?? messages().blankTemplateDescription,
            },
          ]),
      ...shown().map((template) => ({
        value: template.key,
        label: template.name,
        description: template.description,
        media: template.thumbnail,
      })),
    ];
  }
  function chosen(): TemplateItem | undefined {
    return props.templates.find((template) => template.key === selected());
  }
  function hasChoice(): boolean {
    return selected() === BLANK_TEMPLATE || chosen() !== undefined;
  }
  function start(): void {
    if (selected() === BLANK_TEMPLATE) props.onStart(null);
    else {
      const template = chosen();
      if (template !== undefined) props.onStart(template);
    }
  }
  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="template-gallery"
      aria-label={props.label}
    >
      <Show when={(props.categories ?? []).length > 0}>
        <div
          class={cls().filters}
          data-slot="template-gallery-filters"
          role="group"
          aria-label={messages().templateCategories}
        >
          <Chip size="sm" selected={category() === null} onSelectedChange={() => setCategory(null)}>
            {messages().allTemplates}
          </Chip>
          <For each={() => props.categories ?? []}>
            {(one: TemplateCategory) => (
              <Chip
                size="sm"
                selected={category() === one.key}
                onSelectedChange={(pressed: boolean) => setCategory(pressed ? one.key : null)}
              >
                {one.label}
              </Chip>
            )}
          </For>
        </div>
      </Show>
      <div class={cls().body} data-slot="template-gallery-body">
        <div class={cls().cards} data-slot="template-gallery-cards">
          <Show
            when={props.loading !== true}
            fallback={
              <div class={cls().skeletons} data-slot="template-gallery-loading" aria-busy="true">
                <For each={[0, 1, 2, 3]}>{() => <Skeleton class={cls().skeleton} />}</For>
              </div>
            }
          >
            <Show
              when={options().length > 0}
              fallback={<EmptyState placement="section" heading={messages().noTemplates} />}
            >
              <RadioCards
                label={props.cardsLabel ?? messages().startFrom}
                options={options()}
                value={selected()}
                onChange={(value: string | null) => setSelected(value)}
                minCardWidth={props.minCardWidth ?? "12rem"}
                mediaRatio={props.thumbnailRatio}
              />
            </Show>
          </Show>
        </div>
        <div
          class={cls().pane}
          id={paneId}
          data-slot="template-gallery-pane"
          aria-live="polite"
          aria-label={messages().templatePreview}
          role="region"
        >
          <Show
            when={hasChoice()}
            fallback={
              <p class={cls().hint} data-slot="template-gallery-hint">
                {messages().chooseTemplate}
              </p>
            }
          >
            <Show when={chosen()?.preview ?? chosen()?.thumbnail}>
              <div class={cls().preview} data-slot="template-gallery-preview" aria-hidden="true">
                {chosen()?.preview ?? chosen()?.thumbnail}
              </div>
            </Show>
            <h3 class={cls().paneName} data-slot="template-gallery-name">
              {chosen()?.name ?? blank()?.name ?? messages().blankTemplate}
            </h3>
            <Show
              when={
                chosen()?.description ??
                (chosen() === undefined
                  ? (blank()?.description ?? messages().blankTemplateDescription)
                  : undefined)
              }
            >
              {(words: () => string) => (
                <p class={cls().paneDescription} data-slot="template-gallery-description">
                  {words()}
                </p>
              )}
            </Show>
            <Button class={cls().start} data-slot="template-gallery-start" onPress={start}>
              {props.startLabel ?? messages().useTemplate}
            </Button>
          </Show>
        </div>
      </div>
    </section>
  );
}

/** What a template is called and filed under, as its author wrote it. */
export interface TemplateDetails {
  name: string;
  description: string;
  category: string | null;
}

export interface SaveTemplateDialogProps {
  /** Keeps it as a template; a failure thrown here is shown on the form. */
  onSave: (details: TemplateDetails) => void | Promise<void>;
  /** The categories it can be filed under; none, and the field is left out. */
  categories?: readonly TemplateCategory[];
  /** The name it starts with: the document's own. */
  defaultName?: string;
  /** The control that opens it. */
  trigger?: Child;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** @default "Save as a template" */
  heading?: Child;
  description?: Child;
}

/**
 * Keeps something as a template others can start from: its name, a line
 * about it and its category, in a `FormDialog` (a sheet on a phone).
 *
 * ```tsx
 * <SaveTemplateDialog trigger={<Button variant="outline">Save as template</Button>}
 *   defaultName={doc.title} categories={categories} onSave={(details) => api.saveTemplate(doc.id, details)} />
 * ```
 *
 * The name is required; closing with changes asks first, as every arc form
 * dialog does.
 */
export function SaveTemplateDialog(props: SaveTemplateDialogProps) {
  const messages = useArcMessages();
  const form = useArcForm(() => ({
    defaultValues: {
      name: untrack(() => props.defaultName) ?? "",
      description: "",
      category: null as string | null,
    },
    validators: {
      onSubmit: ({ value }) =>
        value.name.trim() === "" ? { fields: { name: messages().nameTheTemplate } } : undefined,
    },
    onSubmit: async ({ value }) => {
      await props.onSave({
        name: value.name.trim(),
        description: value.description.trim(),
        category: value.category,
      });
    },
  }));
  function categoryOptions(): readonly FieldOption[] {
    return (props.categories ?? []).map((one) => ({ value: one.key, label: one.label }));
  }
  return (
    <FormDialog
      form={form}
      heading={props.heading ?? messages().saveAsTemplate}
      description={props.description}
      trigger={props.trigger}
      open={props.open}
      defaultOpen={props.defaultOpen}
      onOpenChange={props.onOpenChange}
      submitLabel={messages().saveTemplate}
    >
      <form.AppField name="name">
        {(field) => (
          <field.TextField label={messages().templateName} isRequired autoComplete="off" />
        )}
      </form.AppField>
      <form.AppField name="description">
        {(field) => <field.TextareaField label={messages().templateDescription} />}
      </form.AppField>
      <Show when={categoryOptions().length > 0}>
        <form.AppField name="category">
          {(field) => (
            <field.SelectField
              label={messages().templateCategory}
              options={categoryOptions()}
              noneLabel={messages().noCategory}
            />
          )}
        </form.AppField>
      </Show>
    </FormDialog>
  );
}
