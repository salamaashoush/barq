import { type Child, Show, createSignal, createUniqueId, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { controllable } from "@barqjs/aria/utils";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Checkbox } from "@barqjs/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@barqjs/ui/input-group";
import { Progress } from "@barqjs/ui/progress";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, interaction, layout, space, type } from "../style/index.ts";
import { IconButton } from "./icon-button.tsx";
import { InlineEdit } from "./inline-edit.tsx";
import { List, type ListReorderEvent, reorderItems } from "./item-list.tsx";
import { useArcMessages } from "./messages.ts";

/** One line of a checklist: a subtask, a step to tick off. */
export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export const checklistEditorStyles = variants({
  slots: {
    root: arc(layout.column, gap[2], layout.minZero),
    header: arc(layout.row, gap[3]),
    title: arc(type.label, layout.grow, layout.minZero),
    count: arc(type.meta, type.numeric, layout.noShrink),
    progress: arc({}),
    list: arc({}),
    item: arc(layout.row, gap[2], { minBlockSize: space.x10 }),
    check: arc(layout.noShrink),
    label: arc(layout.grow, layout.minZero),
    done: arc(fg.faint, { textDecorationLine: "line-through" }),
    remove: arc(layout.noShrink, interaction.reveal),
    add: arc({}),
    empty: arc(type.meta, { paddingBlock: space.x2 }),
  },
});

type Slots = ReturnType<typeof checklistEditorStyles>;

export interface ChecklistEditorProps extends Customisable<Slots> {
  /** Names the checklist: "Subtasks". */
  label: string;
  value?: readonly ChecklistItem[];
  defaultValue?: readonly ChecklistItem[];
  onChange?: (items: ChecklistItem[]) => void;
  /** A new item for the text typed. @default a fresh id, not done */
  newItem?: (label: string) => ChecklistItem;
  /** Rows drag, or move from the keyboard through their handle, to reorder. @default true */
  reorderable?: boolean;
  /** The count and the bar over the list. @default true */
  showProgress?: boolean;
  /** @default the provider's `addChecklistItem`, "Add an item" */
  addPlaceholder?: string;
  /** What an item's text is called, for its editor's name. @default the provider's `checklistItem` */
  itemLabel?: string;
  /** What an empty list says. */
  emptyLabel?: Child;
  isDisabled?: boolean;
  id?: string;
}

let made = 0;

function freshItem(label: string): ChecklistItem {
  made += 1;
  return { id: `item-${Date.now().toString(36)}-${String(made)}`, label, done: false };
}

/**
 * A checklist whose lines are edited where they are: a task's subtasks, a
 * launch's steps.
 *
 * ```tsx
 * <ChecklistEditor label="Subtasks" value={subtasks()} onChange={setSubtasks} />
 * ```
 *
 * Each line is a checkbox, its text an `InlineEdit` and a remove button
 * that shows on hover and focus and always on touch. A field under the
 * list adds a line on Enter and stays for the next, Escape emptying it.
 * The lines are a `List` that reorders by drag or through each line's
 * handle, with tab navigation so every key typed into a line's text stays
 * there. Over it, how many are done, in words and as a bar.
 */
export function ChecklistEditor(props: ChecklistEditorProps) {
  const messages = useArcMessages();
  const headingId = createUniqueId();
  const [items, setItems] = controllable<readonly ChecklistItem[]>(
    () => props.value,
    () => props.defaultValue ?? [],
    (next) => props.onChange?.([...next]),
  );
  const [draft, setDraft] = createSignal("");
  let adder: HTMLInputElement | undefined;
  let root: HTMLElement | undefined;
  function cls(): Slots {
    return parts(checklistEditorStyles(), props.classes);
  }
  function done(): number {
    return items().filter((item) => item.done).length;
  }
  function update(id: string, change: Partial<ChecklistItem>): void {
    setItems(untrack(items).map((item) => (item.id === id ? { ...item, ...change } : item)));
  }
  function add(): void {
    const text = untrack(draft).trim();
    if (text === "") return;
    const item = (untrack(() => props.newItem) ?? freshItem)(text);
    setItems([...untrack(items), item]);
    setDraft("");
    announce(untrack(messages).rowAdded(text), "polite");
  }
  function remove(item: ChecklistItem): void {
    const before = untrack(items);
    const at = before.findIndex((one) => one.id === item.id);
    setItems(before.filter((one) => one.id !== item.id));
    announce(untrack(messages).rowRemoved(item.label), "polite");
    flush();
    const checks = root?.querySelectorAll<HTMLElement>(
      '[data-slot="checklist-editor-item"] input[type="checkbox"]',
    );
    (checks?.[Math.min(at, checks.length - 1)] ?? adder)?.focus();
  }
  function reorder(event: ListReorderEvent): void {
    setItems(reorderItems(untrack(items), event));
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="checklist-editor"
      ref={(element: HTMLElement) => {
        root = element;
      }}
    >
      <div class={cls().header} data-slot="checklist-editor-header" id={headingId}>
        <span class={cls().title} data-slot="checklist-editor-title">
          {props.label}
        </span>
        <Show when={props.showProgress !== false && items().length > 0}>
          <span class={cls().count} data-slot="checklist-editor-count" aria-hidden="true">
            {`${String(done())}/${String(items().length)}`}
          </span>
        </Show>
      </div>
      <Show when={props.showProgress !== false && items().length > 0}>
        <Progress
          class={cls().progress}
          data-slot="checklist-editor-progress"
          aria-label={props.label}
          value={done()}
          max={items().length}
          valueLabel={messages().checklistDone(done(), items().length)}
        />
      </Show>
      <List<ChecklistItem>
        class={cls().list}
        aria-label={props.label}
        items={items()}
        divided={false}
        keyboardNavigationBehavior="tab"
        getTextValue={(item: ChecklistItem) => item.label}
        onReorder={props.reorderable === false || props.isDisabled === true ? undefined : reorder}
        empty={
          <Show when={props.emptyLabel !== undefined}>
            <p class={cls().empty} data-slot="checklist-editor-empty">
              {props.emptyLabel}
            </p>
          </Show>
        }
      >
        {(item: ChecklistItem) => (
          <div
            class={cls().item}
            data-slot="checklist-editor-item"
            data-done={item.done ? "" : undefined}
          >
            <Checkbox
              class={cls().check}
              data-slot="checklist-editor-check"
              aria-label={item.label}
              isSelected={item.done}
              isDisabled={props.isDisabled}
              onChange={(checked: boolean) => update(item.id, { done: checked })}
            />
            <InlineEdit
              class={cls().label}
              classes={{ display: item.done ? cls().done : "" }}
              label={props.itemLabel ?? messages().checklistItem}
              value={item.label}
              isDisabled={props.isDisabled}
              validate={(text: string) =>
                text.trim() === "" ? messages().emptyChecklistItem : undefined
              }
              onSave={(text: string) => update(item.id, { label: text.trim() })}
            />
            <IconButton
              class={cls().remove}
              slot="checklist-editor-remove"
              size="sm"
              label={messages().removeRowOf(item.label)}
              isDisabled={props.isDisabled}
              onPress={() => remove(item)}
            >
              <Trash2 />
            </IconButton>
          </div>
        )}
      </List>
      <Show when={props.isDisabled !== true}>
        <InputGroup class={cls().add} data-slot="checklist-editor-add">
          <InputGroupAddon>
            <Plus aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={props.addPlaceholder ?? messages().addChecklistItem}
            placeholder={props.addPlaceholder ?? messages().addChecklistItem}
            value={draft()}
            ref={(element: HTMLInputElement) => {
              adder = element;
            }}
            onInput={(event: Event) => {
              setDraft((event.currentTarget as HTMLInputElement).value);
            }}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              } else if (event.key === "Escape" && untrack(draft) !== "") {
                event.preventDefault();
                setDraft("");
              }
            }}
          />
        </InputGroup>
      </Show>
    </div>
  );
}
