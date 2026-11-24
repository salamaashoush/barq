/**
 * What a grid says when its selection changes.
 *
 * Most screen readers say nothing when a row of a grid is selected or
 * deselected: `aria-selected` changes on an element the reader has already
 * left, or on one it is standing on and does not re-read. So the grid says it
 * through the live region: "Bar selected.", "Bar not selected.", and the count
 * once more than one row is involved, so a user extending a range with Shift
 * hears how far it reaches. Selecting the first row of a multiple selection
 * says only the row, because "1 item selected" adds nothing to it.
 *
 * Only while the grid has focus. A selection written by the page (a filter, a
 * controlled prop, a "clear" button elsewhere) is not the user's change to a
 * grid they are in, and announcing it would talk over whatever they are
 * reading. A pointer press selects on pointer down, before the grid has taken
 * focus, so a change made while the grid is not focused waits a frame to see
 * whether focus arrives with it.
 *
 * Under `replace` selection the row that ends up selected is named, whatever
 * changed: arrowing down a list that selects on focus says "Bar selected."
 * rather than "Bar selected. Foo not selected."
 *
 * The description is the other half. A `replace` grid whose rows also have an
 * action opens a row on a tap, so on a touch device the way to select is a
 * long press, and nothing on screen says so.
 */

import { createEffect, untrack } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import type { Collection, Key, SelectionManager, SelectionValue } from "./collections.ts";
import { StringDictionary, stringFormatter } from "./i18n.ts";
import { description } from "./interactions/description.ts";
import { modality } from "./interactions/modality.ts";
import { announce } from "./live.ts";
import { access, type DOMProps, type MaybeAccessor } from "./utils.ts";

export type GridSelectionMessage =
  | "selectedItem"
  | "deselectedItem"
  | "selectedCount"
  | "selectedAll"
  | "longPressToSelect";

function text(value: string | number | boolean | undefined): string {
  return value === undefined ? "" : String(value);
}

export const gridSelectionStrings: StringDictionary<GridSelectionMessage> =
  new StringDictionary<GridSelectionMessage>({
    "ar-AE": {
      selectedItem: (v) => `${text(v?.item)} المحدد`,
      deselectedItem: (v) => `${text(v?.item)} غير المحدد`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `لم يتم تحديد عناصر`, one: () => `${f.number(Number(v?.count))} عنصر محدد`, other: () => `${f.number(Number(v?.count))} عنصر محدد` })}.`,
      selectedAll: "جميع العناصر المحددة.",
      longPressToSelect: "اضغط مطولًا للدخول إلى وضع التحديد.",
    },
    "bg-BG": {
      selectedItem: (v) => `${text(v?.item)} избран.`,
      deselectedItem: (v) => `${text(v?.item)} не е избран.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Няма избрани елементи`, one: () => `${f.number(Number(v?.count))} избран елемент`, other: () => `${f.number(Number(v?.count))} избрани елементи` })}.`,
      selectedAll: "Всички елементи са избрани.",
      longPressToSelect: "Натиснете и задръжте за да влезете в избирателен режим.",
    },
    "cs-CZ": {
      selectedItem: (v) => `Vybrána položka ${text(v?.item)}.`,
      deselectedItem: (v) => `Položka ${text(v?.item)} není vybrána.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nevybrány žádné položky`, one: () => `Vybrána ${f.number(Number(v?.count))} položka`, other: () => `Vybráno ${f.number(Number(v?.count))} položek` })}.`,
      selectedAll: "Vybrány všechny položky.",
      longPressToSelect: "Dlouhým stisknutím přejdete do režimu výběru.",
    },
    "da-DK": {
      selectedItem: (v) => `${text(v?.item)} valgt.`,
      deselectedItem: (v) => `${text(v?.item)} ikke valgt.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Ingen elementer valgt`, one: () => `${f.number(Number(v?.count))} element valgt`, other: () => `${f.number(Number(v?.count))} elementer valgt` })}.`,
      selectedAll: "Alle elementer valgt.",
      longPressToSelect: "Lav et langt tryk for at aktivere valgtilstand.",
    },
    "de-DE": {
      selectedItem: (v) => `${text(v?.item)} ausgewählt.`,
      deselectedItem: (v) => `${text(v?.item)} nicht ausgewählt.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Keine Elemente ausgewählt`, one: () => `${f.number(Number(v?.count))} Element ausgewählt`, other: () => `${f.number(Number(v?.count))} Elemente ausgewählt` })}.`,
      selectedAll: "Alle Elemente ausgewählt.",
      longPressToSelect: "Gedrückt halten, um Auswahlmodus zu öffnen.",
    },
    "el-GR": {
      selectedItem: (v) => `Επιλέχθηκε το στοιχείο ${text(v?.item)}.`,
      deselectedItem: (v) => `Δεν επιλέχθηκε το στοιχείο ${text(v?.item)}.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Δεν επιλέχθηκαν στοιχεία`, one: () => `Επιλέχθηκε ${f.number(Number(v?.count))} στοιχείο`, other: () => `Επιλέχθηκαν ${f.number(Number(v?.count))} στοιχεία` })}.`,
      selectedAll: "Επιλέχθηκαν όλα τα στοιχεία.",
      longPressToSelect: "Πατήστε παρατεταμένα για να μπείτε σε λειτουργία επιλογής.",
    },
    "en-US": {
      selectedItem: (v) => `${text(v?.item)} selected.`,
      deselectedItem: (v) => `${text(v?.item)} not selected.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `No items selected`, one: () => `${f.number(Number(v?.count))} item selected`, other: () => `${f.number(Number(v?.count))} items selected` })}.`,
      selectedAll: "All items selected.",
      longPressToSelect: "Long press to enter selection mode.",
    },
    "es-ES": {
      selectedItem: (v) => `${text(v?.item)} seleccionado.`,
      deselectedItem: (v) => `${text(v?.item)} no seleccionado.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Ningún elemento seleccionado`, one: () => `${f.number(Number(v?.count))} elemento seleccionado`, other: () => `${f.number(Number(v?.count))} elementos seleccionados` })}.`,
      selectedAll: "Todos los elementos seleccionados.",
      longPressToSelect: "Mantenga pulsado para abrir el modo de selección.",
    },
    "et-EE": {
      selectedItem: (v) => `${text(v?.item)} valitud.`,
      deselectedItem: (v) => `${text(v?.item)} pole valitud.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Üksusi pole valitud`, one: () => `${f.number(Number(v?.count))} üksus valitud`, other: () => `${f.number(Number(v?.count))} üksust valitud` })}.`,
      selectedAll: "Kõik üksused valitud.",
      longPressToSelect: "Valikurežiimi sisenemiseks vajutage pikalt.",
    },
    "fi-FI": {
      selectedItem: (v) => `${text(v?.item)} valittu.`,
      deselectedItem: (v) => `Kohdetta ${text(v?.item)} ei valittu.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Ei yhtään kohdetta valittu`, one: () => `${f.number(Number(v?.count))} kohde valittu`, other: () => `${f.number(Number(v?.count))} kohdetta valittu` })}.`,
      selectedAll: "Kaikki kohteet valittu.",
      longPressToSelect: "Siirry valintatilaan painamalla pitkään.",
    },
    "fr-FR": {
      selectedItem: (v) => `${text(v?.item)} sélectionné.`,
      deselectedItem: (v) => `${text(v?.item)} non sélectionné.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Aucun élément sélectionné`, one: () => `${f.number(Number(v?.count))} élément sélectionné`, other: () => `${f.number(Number(v?.count))} éléments sélectionnés` })}.`,
      selectedAll: "Tous les éléments sélectionnés.",
      longPressToSelect: "Appuyez de manière prolongée pour passer en mode de sélection.",
    },
    "he-IL": {
      selectedItem: (v) => `${text(v?.item)} נבחר.`,
      deselectedItem: (v) => `${text(v?.item)} לא נבחר.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `לא נבחרו פריטים`, one: () => `פריט ${f.number(Number(v?.count))} נבחר`, other: () => `${f.number(Number(v?.count))} פריטים נבחרו` })}.`,
      selectedAll: "כל הפריטים נבחרו.",
      longPressToSelect: "הקשה ארוכה לכניסה למצב בחירה.",
    },
    "hr-HR": {
      selectedItem: (v) => `Stavka ${text(v?.item)} je odabrana.`,
      deselectedItem: (v) => `Stavka ${text(v?.item)} nije odabrana.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nije odabrana nijedna stavka`, one: () => `Odabrana je ${f.number(Number(v?.count))} stavka`, other: () => `Odabrano je ${f.number(Number(v?.count))} stavki` })}.`,
      selectedAll: "Odabrane su sve stavke.",
      longPressToSelect: "Dugo pritisnite za ulazak u način odabira.",
    },
    "hu-HU": {
      selectedItem: (v) => `${text(v?.item)} kijelölve.`,
      deselectedItem: (v) => `${text(v?.item)} nincs kijelölve.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Egy elem sincs kijelölve`, one: () => `${f.number(Number(v?.count))} elem kijelölve`, other: () => `${f.number(Number(v?.count))} elem kijelölve` })}.`,
      selectedAll: "Az összes elem kijelölve.",
      longPressToSelect: "Nyomja hosszan a kijelöléshez.",
    },
    "it-IT": {
      selectedItem: (v) => `${text(v?.item)} selezionato.`,
      deselectedItem: (v) => `${text(v?.item)} non selezionato.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nessun elemento selezionato`, one: () => `${f.number(Number(v?.count))} elemento selezionato`, other: () => `${f.number(Number(v?.count))} elementi selezionati` })}.`,
      selectedAll: "Tutti gli elementi selezionati.",
      longPressToSelect: "Premi a lungo per passare alla modalità di selezione.",
    },
    "ja-JP": {
      selectedItem: (v) => `${text(v?.item)} を選択しました。`,
      deselectedItem: (v) => `${text(v?.item)} が選択されていません。`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `項目が選択されていません`, one: () => `${f.number(Number(v?.count))} 項目を選択しました`, other: () => `${f.number(Number(v?.count))} 項目を選択しました` })}。`,
      selectedAll: "すべての項目を選択しました。",
      longPressToSelect: "長押しして選択モードを開きます。",
    },
    "ko-KR": {
      selectedItem: (v) => `${text(v?.item)}이(가) 선택되었습니다.`,
      deselectedItem: (v) => `${text(v?.item)}이(가) 선택되지 않았습니다.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `선택된 항목이 없습니다`, one: () => `${f.number(Number(v?.count))}개 항목이 선택되었습니다`, other: () => `${f.number(Number(v?.count))}개 항목이 선택되었습니다` })}.`,
      selectedAll: "모든 항목이 선택되었습니다.",
      longPressToSelect: "선택 모드로 들어가려면 길게 누르십시오.",
    },
    "lt-LT": {
      selectedItem: (v) => `Pasirinkta: ${text(v?.item)}.`,
      deselectedItem: (v) => `${text(v?.item)} nepasirinkta.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nepasirinktas nė vienas elementas`, one: () => `Pasirinktas ${f.number(Number(v?.count))} elementas`, other: () => `Pasirinkta elementų: ${f.number(Number(v?.count))}` })}.`,
      selectedAll: "Pasirinkti visi elementai.",
      longPressToSelect: "Norėdami įjungti pasirinkimo režimą, paspauskite ir palaikykite.",
    },
    "lv-LV": {
      selectedItem: (v) => `Atlasīts vienums ${text(v?.item)}.`,
      deselectedItem: (v) => `Vienums ${text(v?.item)} nav atlasīts.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nav atlasīts neviens vienums`, one: () => `Atlasīto vienumu skaits: ${f.number(Number(v?.count))}`, other: () => `Atlasīto vienumu skaits: ${f.number(Number(v?.count))}` })}.`,
      selectedAll: "Atlasīti visi vienumi.",
      longPressToSelect: "Ilgi turiet nospiestu. lai ieslēgtu atlases režīmu.",
    },
    "nb-NO": {
      selectedItem: (v) => `${text(v?.item)} er valgt.`,
      deselectedItem: (v) => `${text(v?.item)} er ikke valgt.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Ingen elementer er valgt`, one: () => `${f.number(Number(v?.count))} element er valgt`, other: () => `${f.number(Number(v?.count))} elementer er valgt` })}.`,
      selectedAll: "Alle elementer er valgt.",
      longPressToSelect: "Bruk et langt trykk for å gå inn i valgmodus.",
    },
    "nl-NL": {
      selectedItem: (v) => `${text(v?.item)} geselecteerd.`,
      deselectedItem: (v) => `${text(v?.item)} niet geselecteerd.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Geen items geselecteerd`, one: () => `${f.number(Number(v?.count))} item geselecteerd`, other: () => `${f.number(Number(v?.count))} items geselecteerd` })}.`,
      selectedAll: "Alle items geselecteerd.",
      longPressToSelect: "Druk lang om de selectiemodus te openen.",
    },
    "pl-PL": {
      selectedItem: (v) => `Zaznaczono ${text(v?.item)}.`,
      deselectedItem: (v) => `Nie zaznaczono ${text(v?.item)}.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nie zaznaczono żadnych elementów`, one: () => `${f.number(Number(v?.count))} zaznaczony element`, other: () => `${f.number(Number(v?.count))} zaznaczonych elementów` })}.`,
      selectedAll: "Wszystkie zaznaczone elementy.",
      longPressToSelect: "Naciśnij i przytrzymaj, aby wejść do trybu wyboru.",
    },
    "pt-BR": {
      selectedItem: (v) => `${text(v?.item)} selecionado.`,
      deselectedItem: (v) => `${text(v?.item)} não selecionado.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nenhum item selecionado`, one: () => `${f.number(Number(v?.count))} item selecionado`, other: () => `${f.number(Number(v?.count))} itens selecionados` })}.`,
      selectedAll: "Todos os itens selecionados.",
      longPressToSelect: "Mantenha pressionado para entrar no modo de seleção.",
    },
    "pt-PT": {
      selectedItem: (v) => `${text(v?.item)} selecionado.`,
      deselectedItem: (v) => `${text(v?.item)} não selecionado.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nenhum item selecionado`, one: () => `${f.number(Number(v?.count))} item selecionado`, other: () => `${f.number(Number(v?.count))} itens selecionados` })}.`,
      selectedAll: "Todos os itens selecionados.",
      longPressToSelect: "Prima continuamente para entrar no modo de seleção.",
    },
    "ro-RO": {
      selectedItem: (v) => `${text(v?.item)} selectat.`,
      deselectedItem: (v) => `${text(v?.item)} neselectat.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Niciun element selectat`, one: () => `${f.number(Number(v?.count))} element selectat`, other: () => `${f.number(Number(v?.count))} elemente selectate` })}.`,
      selectedAll: "Toate elementele selectate.",
      longPressToSelect: "Apăsați lung pentru a intra în modul de selectare.",
    },
    "ru-RU": {
      selectedItem: (v) => `${text(v?.item)} выбрано.`,
      deselectedItem: (v) => `${text(v?.item)} не выбрано.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Нет выбранных элементов`, one: () => `${f.number(Number(v?.count))} элемент выбран`, other: () => `${f.number(Number(v?.count))} элементов выбрано` })}.`,
      selectedAll: "Выбраны все элементы.",
      longPressToSelect: "Нажмите и удерживайте для входа в режим выбора.",
    },
    "sk-SK": {
      selectedItem: (v) => `Vybraté položky: ${text(v?.item)}.`,
      deselectedItem: (v) => `Nevybraté položky: ${text(v?.item)}.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Žiadne vybraté položky`, one: () => `${f.number(Number(v?.count))} vybratá položka`, other: () => `Počet vybratých položiek:${f.number(Number(v?.count))}` })}.`,
      selectedAll: "Všetky vybraté položky.",
      longPressToSelect: "Dlhším stlačením prejdite do režimu výberu.",
    },
    "sl-SI": {
      selectedItem: (v) => `Element ${text(v?.item)} je izbran.`,
      deselectedItem: (v) => `Element ${text(v?.item)} ni izbran.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Noben element ni izbran`, one: () => `${f.number(Number(v?.count))} element je izbran`, other: () => `${f.number(Number(v?.count))} elementov je izbranih` })}.`,
      selectedAll: "Vsi elementi so izbrani.",
      longPressToSelect: "Za izbirni način pritisnite in dlje časa držite.",
    },
    "sr-SP": {
      selectedItem: (v) => `${text(v?.item)} je izabrano.`,
      deselectedItem: (v) => `${text(v?.item)} nije izabrano.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Nije izabrana nijedna stavka`, one: () => `Izabrana je ${f.number(Number(v?.count))} stavka`, other: () => `Izabrano je ${f.number(Number(v?.count))} stavki` })}.`,
      selectedAll: "Izabrane su sve stavke.",
      longPressToSelect: "Dugo pritisnite za ulazak u režim biranja.",
    },
    "sv-SE": {
      selectedItem: (v) => `${text(v?.item)} markerat.`,
      deselectedItem: (v) => `${text(v?.item)} ej markerat.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Inga markerade objekt`, one: () => `${f.number(Number(v?.count))} markerat objekt`, other: () => `${f.number(Number(v?.count))} markerade objekt` })}.`,
      selectedAll: "Alla markerade objekt.",
      longPressToSelect: "Tryck länge när du vill öppna väljarläge.",
    },
    "tr-TR": {
      selectedItem: (v) => `${text(v?.item)} seçildi.`,
      deselectedItem: (v) => `${text(v?.item)} seçilmedi.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Hiçbir öge seçilmedi`, one: () => `${f.number(Number(v?.count))} öge seçildi`, other: () => `${f.number(Number(v?.count))} öge seçildi` })}.`,
      selectedAll: "Tüm ögeler seçildi.",
      longPressToSelect: "Seçim moduna girmek için uzun basın.",
    },
    "uk-UA": {
      selectedItem: (v) => `${text(v?.item)} вибрано.`,
      deselectedItem: (v) => `${text(v?.item)} не вибрано.`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `Жодних елементів не вибрано`, one: () => `${f.number(Number(v?.count))} елемент вибрано`, other: () => `Вибрано елементів: ${f.number(Number(v?.count))}` })}.`,
      selectedAll: "Усі елементи вибрано.",
      longPressToSelect: "Виконайте довге натиснення, щоб перейти в режим вибору.",
    },
    "zh-CN": {
      selectedItem: (v) => `已选择 ${text(v?.item)}。`,
      deselectedItem: (v) => `未选择 ${text(v?.item)}。`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `未选择项目`, one: () => `已选择 ${f.number(Number(v?.count))} 个项目`, other: () => `已选择 ${f.number(Number(v?.count))} 个项目` })}。`,
      selectedAll: "已选择所有项目。",
      longPressToSelect: "长按以进入选择模式。",
    },
    "zh-TW": {
      selectedItem: (v) => `已選取「${text(v?.item)}」。`,
      deselectedItem: (v) => `未選取「${text(v?.item)}」。`,
      selectedCount: (v, f) =>
        `${f.plural(Number(v?.count), { "=0": () => `未選取任何項目`, one: () => `已選取 ${f.number(Number(v?.count))} 個項目`, other: () => `已選取 ${f.number(Number(v?.count))} 個項目` })}。`,
      selectedAll: "已選取所有項目。",
      longPressToSelect: "長按以進入選擇模式。",
    },
  });

/** What the announcement reads: the collection and its selection. */
export interface GridSelectionState {
  collection: () => Collection<unknown>;
  selectionManager: () => SelectionManager;
}

export interface GridSelectionAnnouncementOptions {
  /** What a row is called when it is announced. @default the row's text value */
  getRowText?: (key: Key) => string | undefined;
}

/** The keys in `a` that are not in `b`. Nothing, when either is "all". */
function difference(a: SelectionValue, b: SelectionValue): Set<Key> {
  const result = new Set<Key>();
  if (a === "all" || b === "all") return result;
  for (const key of a) if (!b.has(key)) result.add(key);
  return result;
}

function first(keys: Set<Key>): Key | undefined {
  return keys.values().next().value;
}

/**
 * Announce a change to a grid's selection made from inside the grid.
 *
 * ```ts
 * gridSelectionAnnouncement({}, state);
 * ```
 */
export function gridSelectionAnnouncement(
  options: GridSelectionAnnouncementOptions,
  state: GridSelectionState,
): void {
  if (isServer) return;
  const message = stringFormatter(gridSelectionStrings);
  const rowText = (key: Key): string | undefined =>
    options.getRowText?.(key) ?? state.collection().getItem(key)?.textValue;

  let last: SelectionValue = untrack(() => state.selectionManager().rawSelection);

  const announceChange = (): void => {
    const manager = state.selectionManager();
    const selection = manager.rawSelection;
    if (!manager.isFocused || selection === last) {
      last = selection;
      return;
    }

    const added = difference(selection, last);
    const removed = difference(last, selection);
    const messages: string[] = [];
    const collection = state.collection();

    const selected = manager.selectedKeys;
    if (selected.size === 1 && manager.selectionBehavior === "replace") {
      const key = first(selected);
      const name = key !== undefined && collection.getItem(key) !== null ? rowText(key) : undefined;
      if (name) messages.push(message().format("selectedItem", { item: name }));
    } else if (added.size === 1 && removed.size === 0) {
      const key = first(added);
      const name = key === undefined ? undefined : rowText(key);
      if (name) messages.push(message().format("selectedItem", { item: name }));
    } else if (removed.size === 1 && added.size === 0) {
      const key = first(removed);
      const name = key !== undefined && collection.getItem(key) !== null ? rowText(key) : undefined;
      if (name) messages.push(message().format("deselectedItem", { item: name }));
    }

    // The count, unless the change was the first row of a selection: there
    // the row's name already says everything the count would.
    if (manager.selectionMode === "multiple") {
      const several = (value: SelectionValue): boolean => value === "all" || value.size > 1;
      if (messages.length === 0 || several(selection) || several(last)) {
        messages.push(
          selection === "all"
            ? message().format("selectedAll")
            : message().format("selectedCount", { count: selection.size }),
        );
      }
    }

    if (messages.length > 0) announce(messages.join(" "));
    last = selection;
  };

  createEffect(
    (previous?: { selection: SelectionValue; focused: boolean }) => {
      const manager = state.selectionManager();
      const selection = manager.rawSelection;
      const focused = manager.isFocused;
      // The same value back when neither changed, so a manager rebuilt around
      // a new collection does not cancel a frame that is still waiting.
      if (previous?.selection === selection && previous.focused === focused) return previous;
      return { selection, focused };
    },
    ({ focused }) => {
      if (focused) {
        untrack(announceChange);
        return undefined;
      }
      const frame = requestAnimationFrame(announceChange);
      return () => cancelAnimationFrame(frame);
    },
    { defer: true },
  );
}

export interface HighlightSelectionDescriptionOptions {
  selectionManager: () => SelectionManager;
  /** Whether a row has an action of its own, which is what a tap then performs. */
  hasItemActions?: MaybeAccessor<boolean | undefined>;
}

/**
 * `aria-describedby` for a grid whose tap is an action, saying how to select
 * on a touch device: "Long press to enter selection mode."
 */
export function highlightSelectionDescription(
  options: HighlightSelectionDescriptionOptions,
): DOMProps {
  const message = stringFormatter(gridSelectionStrings);
  const how = modality();
  // No modality yet is a page nobody has touched, which on a touch device
  // will be touched.
  const shouldLongPress = (): boolean => {
    const current = how();
    return (
      (current === "pointer" || current === "virtual" || current === null) &&
      typeof window !== "undefined" &&
      "ontouchstart" in window
    );
  };

  return description(() => {
    const manager = options.selectionManager();
    if (manager.selectionBehavior !== "replace" || manager.selectionMode === "none") {
      return undefined;
    }
    if (access(options.hasItemActions) !== true || !shouldLongPress()) return undefined;
    return message().format("longPressToSelect");
  });
}
