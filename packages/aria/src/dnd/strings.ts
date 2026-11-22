/** What drag and drop says, to a screen reader and in descriptions. */

import { StringDictionary } from "../i18n.ts";

export type DndMessage =
  | "dragItem"
  | "dragSelectedItems"
  | "dragDescriptionKeyboard"
  | "dragDescriptionKeyboardAlt"
  | "dragDescriptionTouch"
  | "dragDescriptionVirtual"
  | "dragDescriptionLongPress"
  | "dragSelectedKeyboard"
  | "dragSelectedKeyboardAlt"
  | "dragSelectedLongPress"
  | "dragStartedKeyboard"
  | "dragStartedTouch"
  | "dragStartedVirtual"
  | "endDragKeyboard"
  | "endDragTouch"
  | "endDragVirtual"
  | "dropDescriptionKeyboard"
  | "dropDescriptionTouch"
  | "dropDescriptionVirtual"
  | "dropCanceled"
  | "dropComplete"
  | "dropIndicator"
  | "dropOnRoot"
  | "dropOnItem"
  | "insertBefore"
  | "insertBetween"
  | "insertAfter";

function text(value: string | number | boolean | undefined): string {
  return value === undefined ? "" : String(value);
}

export const dndStrings: StringDictionary<DndMessage> = new StringDictionary<DndMessage>({
  "ar-AE": {
    dragItem: (v) => `اسحب ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `اسحب ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} عنصر محدد`, other: () => `${f.number(Number(v?.count))} عناصر محددة` })}`,
    dragDescriptionKeyboard: "اضغط Enter لبدء السحب.",
    dragDescriptionKeyboardAlt: "اضغط على Alt + Enter لبدء السحب.",
    dragDescriptionTouch: "اضغط مرتين لبدء السحب.",
    dragDescriptionVirtual: "انقر لبدء السحب.",
    dragDescriptionLongPress: "اضغط باستمرار لبدء السحب.",
    dragSelectedKeyboard: (v, f) =>
      `اضغط على Enter للسحب ${f.plural(Number(v?.count), { one: () => `عدد العناصر المختارة`, other: () => `عدد العناصر المختارة` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `اضغط على مفتاحي Alt + Enter للسحب ${f.plural(Number(v?.count), { one: () => `عدد العناصر المختارة`, other: () => `عدد العناصر المختارة` })}.`,
    dragSelectedLongPress: (v, f) =>
      `اضغط باستمرار للسحب ${f.plural(Number(v?.count), { one: () => `عدد العناصر المختارة`, other: () => `عدد العناصر المختارة` })}.`,
    dragStartedKeyboard:
      "بدأ السحب. اضغط Tab للانتقال إلى موضع الإفلات، ثم اضغط Enter للإفلات، أو اضغط Escape للإلغاء.",
    dragStartedTouch: "بدأ السحب. انتقل إلى موضع الإفلات، ثم اضغط مرتين للإفلات.",
    dragStartedVirtual: "بدأ السحب. انتقل إلى مكان الإفلات، ثم انقر أو اضغط Enter للإفلات.",
    endDragKeyboard: "السحب. اضغط Enter لإلغاء السحب.",
    endDragTouch: "السحب. اضغط مرتين لإلغاء السحب.",
    endDragVirtual: "السحب. انقر لإلغاء السحب.",
    dropDescriptionKeyboard: "اضغط Enter للإفلات. اضغط Escape لإلغاء السحب.",
    dropDescriptionTouch: "اضغط مرتين للإفلات.",
    dropDescriptionVirtual: "انقر للإفلات.",
    dropCanceled: "تم إلغاء الإفلات.",
    dropComplete: "اكتمل الإفلات.",
    dropIndicator: "مؤشر الإفلات",
    dropOnRoot: "الإفلات",
    dropOnItem: (v) => `إفلات ${text(v?.itemText)}`,
    insertBefore: (v) => `أدخل قبل ${text(v?.itemText)}`,
    insertBetween: (v) => `أدخل بين ${text(v?.beforeItemText)} و ${text(v?.afterItemText)}`,
    insertAfter: (v) => `أدخل بعد ${text(v?.itemText)}`,
  },
  "bg-BG": {
    dragItem: (v) => `Плъзни ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Плъзни ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} избран елемент`, other: () => `${f.number(Number(v?.count))} избрани елемента` })}`,
    dragDescriptionKeyboard: "Натиснете „Enter“, за да започнете да плъзгате.",
    dragDescriptionKeyboardAlt: "Натиснете Alt + Enter, за да започнете да плъзгате.",
    dragDescriptionTouch: "Натиснете двукратно, за да започнете да плъзгате.",
    dragDescriptionVirtual: "Щракнете, за да започнете да плъзгате.",
    dragDescriptionLongPress: "Натиснете продължително, за да започнете да плъзгате.",
    dragSelectedKeyboard: (v, f) =>
      `Натиснете Enter, за да плъзнете ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} избран елемент`, other: () => `${f.number(Number(v?.count))} избрани елементи` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Натиснете Alt и Enter, за да плъзнете ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} избран елемент`, other: () => `${f.number(Number(v?.count))} избрани елементи` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Натиснете продължително, за да плъзнете ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} избран елемент`, other: () => `${f.number(Number(v?.count))} избрани елементи` })}.`,
    dragStartedKeyboard:
      "Започна плъзгане. Натиснете „Tab“, за да се придвижите до целта, след което натиснете „Enter“ за пускане или натиснете „Escape“ за отмяна.",
    dragStartedTouch:
      "Започна плъзгане. Придвижете се до целта, след което натиснете двукратно, за да пуснете.",
    dragStartedVirtual:
      "Започна плъзгане. Придвижете се до целта, след което щракнете или натиснете „Enter“ за пускане.",
    endDragKeyboard: "Плъзгане. Натиснете „Enter“ за отмяна на плъзгането.",
    endDragTouch: "Плъзгане. Натиснете двукратно за отмяна на плъзгането.",
    endDragVirtual: "Плъзгане. Щракнете за отмяна.",
    dropDescriptionKeyboard:
      "Натиснете „Enter“ за пускане. Натиснете „Escape“ за отмяна на плъзгането.",
    dropDescriptionTouch: "Натиснете двукратно за пускане.",
    dropDescriptionVirtual: "Щракнете за пускане.",
    dropCanceled: "Пускането е отменено.",
    dropComplete: "Пускането е завършено.",
    dropIndicator: "индикатор за пускане",
    dropOnRoot: "Пусни върху",
    dropOnItem: (v) => `Пусни върху ${text(v?.itemText)}`,
    insertBefore: (v) => `Вмъкни преди ${text(v?.itemText)}`,
    insertBetween: (v) => `Вмъкни между ${text(v?.beforeItemText)} и ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Вмъкни след ${text(v?.itemText)}`,
  },
  "cs-CZ": {
    dragItem: (v) => `Přetáhnout ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Přetáhnout ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybranou položku`, few: () => `${f.number(Number(v?.count))} vybrané položky`, other: () => `${f.number(Number(v?.count))} vybraných položek` })}`,
    dragDescriptionKeyboard: "Stisknutím klávesy Enter začnete s přetahováním.",
    dragDescriptionKeyboardAlt: "Stisknutím Alt + Enter zahájíte přetahování.",
    dragDescriptionTouch: "Poklepáním začnete s přetahováním.",
    dragDescriptionVirtual: "Kliknutím začnete s přetahováním.",
    dragDescriptionLongPress: "Dlouhým stisknutím zahájíte přetahování.",
    dragSelectedKeyboard: (v, f) =>
      `Stisknutím klávesy Enter přetáhněte ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybranou položku`, other: () => `${f.number(Number(v?.count))} vybrané položky` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Stisknutím Alt + Enter přetáhněte ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybranou položku`, other: () => `${f.number(Number(v?.count))} vybrané položky` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Dlouhým stisknutím přetáhnete ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybranou položku`, other: () => `${f.number(Number(v?.count))} vybrané položky` })}.`,
    dragStartedKeyboard:
      "Začněte s přetahováním. Po stisknutí klávesy Tab najděte požadovaný cíl a stisknutím klávesy Enter přetažení dokončete nebo stisknutím klávesy Esc akci zrušte.",
    dragStartedTouch:
      "Začněte s přetahováním. Najděte požadovaný cíl a poklepáním přetažení dokončete.",
    dragStartedVirtual:
      "Začněte s přetahováním. Najděte požadovaný cíl a kliknutím nebo stisknutím klávesy Enter přetažení dokončete.",
    endDragKeyboard: "Probíhá přetahování. Stisknutím klávesy Enter přetažení zrušíte.",
    endDragTouch: "Probíhá přetahování. Poklepáním přetažení zrušíte.",
    endDragVirtual: "Probíhá přetahování. Kliknutím přetažení zrušíte.",
    dropDescriptionKeyboard:
      "Stisknutím klávesy Enter přetažení dokončete nebo stisknutím klávesy Esc akci zrušte.",
    dropDescriptionTouch: "Poklepáním přetažení dokončete.",
    dropDescriptionVirtual: "Kliknutím objekt přetáhněte.",
    dropCanceled: "Přetažení bylo zrušeno.",
    dropComplete: "Přetažení bylo dokončeno.",
    dropIndicator: "indikátor přetažení",
    dropOnRoot: "Přetáhnout na",
    dropOnItem: (v) => `Přetáhnout na ${text(v?.itemText)}`,
    insertBefore: (v) => `Vložit před ${text(v?.itemText)}`,
    insertBetween: (v) => `Vložit mezi ${text(v?.beforeItemText)} a ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Vložit za ${text(v?.itemText)}`,
  },
  "da-DK": {
    dragItem: (v) => `Træk ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Træk ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valgt element`, other: () => `${f.number(Number(v?.count))} valgte elementer` })}`,
    dragDescriptionKeyboard: "Tryk på Enter for at starte med at trække.",
    dragDescriptionKeyboardAlt: "Tryk på Alt + Enter for at starte med at trække.",
    dragDescriptionTouch: "Dobbelttryk for at starte med at trække.",
    dragDescriptionVirtual: "Klik for at starte med at trække.",
    dragDescriptionLongPress: "Tryk længe for at starte med at trække.",
    dragSelectedKeyboard: (v, f) =>
      `Tryk på Enter for at trække ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valgte element`, other: () => `${f.number(Number(v?.count))} valgte elementer` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Tryk på Alt + Enter for at trække ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valgte element`, other: () => `${f.number(Number(v?.count))} valgte elementer` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Tryk længe for at trække ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valgte element`, other: () => `${f.number(Number(v?.count))} valgte elementer` })}.`,
    dragStartedKeyboard:
      "Startet med at trække. Tryk på Tab for at gå til et slip-mål, tryk derefter på Enter for at slippe, eller tryk på Escape for at annullere.",
    dragStartedTouch:
      "Startet med at trække. Gå til et slip-mål, og dobbelttryk derefter for at slippe.",
    dragStartedVirtual:
      "Startet med at trække. Gå til et slip-mål, og klik eller tryk derefter på enter for at slippe.",
    endDragKeyboard: "Trækning. Tryk på enter for at annullere træk.",
    endDragTouch: "Trækning. Dobbelttryk for at annullere træk.",
    endDragVirtual: "Trækning. Klik for at annullere trækning.",
    dropDescriptionKeyboard:
      "Tryk på Enter for at slippe. Tryk på Escape for at annullere trækning.",
    dropDescriptionTouch: "Dobbelttryk for at slippe.",
    dropDescriptionVirtual: "Klik for at slippe.",
    dropCanceled: "Slip annulleret.",
    dropComplete: "Slip fuldført.",
    dropIndicator: "slip-indikator",
    dropOnRoot: "Slip på",
    dropOnItem: (v) => `Slip på ${text(v?.itemText)}`,
    insertBefore: (v) => `Indsæt før ${text(v?.itemText)}`,
    insertBetween: (v) => `Indsæt mellem ${text(v?.beforeItemText)} og ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Indsæt efter ${text(v?.itemText)}`,
  },
  "de-DE": {
    dragItem: (v) => `${text(v?.itemText)} ziehen`,
    dragSelectedItems: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} ausgewähltes Objekt`, other: () => `${f.number(Number(v?.count))} ausgewählte Objekte` })} ziehen`,
    dragDescriptionKeyboard: "Drücken Sie die Eingabetaste, um den Ziehvorgang zu starten.",
    dragDescriptionKeyboardAlt: "Alt + Eingabe drücken, um den Ziehvorgang zu starten.",
    dragDescriptionTouch: "Tippen Sie doppelt, um den Ziehvorgang zu starten.",
    dragDescriptionVirtual: "Zum Starten des Ziehvorgangs klicken.",
    dragDescriptionLongPress: "Lang drücken, um mit dem Ziehen zu beginnen.",
    dragSelectedKeyboard: (v, f) =>
      `Eingabetaste drücken, um ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} ausgewähltes Element`, other: () => `${f.number(Number(v?.count))} ausgewählte Elemente` })} zu ziehen.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Alt + Eingabetaste drücken, um ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} ausgewähltes Element`, other: () => `${f.number(Number(v?.count))} ausgewählte Elemente` })} zu ziehen.`,
    dragSelectedLongPress: (v, f) =>
      `Lang drücken, um ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} ausgewähltes Element`, other: () => `${f.number(Number(v?.count))} ausgewählte Elemente` })} zu ziehen.`,
    dragStartedKeyboard:
      "Ziehvorgang gestartet. Drücken Sie die Tabulatortaste, um zu einem Ablegeziel zu navigieren und drücken Sie dann die Eingabetaste, um das Objekt abzulegen, oder Escape, um den Vorgang abzubrechen.",
    dragStartedTouch:
      "Ziehvorgang gestartet. Navigieren Sie zu einem Ablegeziel und tippen Sie doppelt, um das Objekt abzulegen.",
    dragStartedVirtual:
      "Ziehvorgang gestartet. Navigieren Sie zu einem Ablegeziel und klicken Sie oder drücken Sie die Eingabetaste, um das Objekt abzulegen.",
    endDragKeyboard: "Ziehvorgang läuft. Drücken Sie die Eingabetaste, um den Vorgang abzubrechen.",
    endDragTouch: "Ziehvorgang läuft. Tippen Sie doppelt, um den Vorgang abzubrechen.",
    endDragVirtual: "Ziehvorgang läuft. Klicken Sie, um den Vorgang abzubrechen.",
    dropDescriptionKeyboard:
      "Drücken Sie die Eingabetaste, um das Objekt abzulegen. Drücken Sie Escape, um den Vorgang abzubrechen.",
    dropDescriptionTouch: "Tippen Sie doppelt, um das Objekt abzulegen.",
    dropDescriptionVirtual: "Zum Ablegen klicken.",
    dropCanceled: "Ablegen abgebrochen.",
    dropComplete: "Ablegen abgeschlossen.",
    dropIndicator: "Ablegeanzeiger",
    dropOnRoot: "Ablegen auf",
    dropOnItem: (v) => `Auf ${text(v?.itemText)} ablegen`,
    insertBefore: (v) => `Vor ${text(v?.itemText)} einfügen`,
    insertBetween: (v) =>
      `Zwischen ${text(v?.beforeItemText)} und ${text(v?.afterItemText)} einfügen`,
    insertAfter: (v) => `Nach ${text(v?.itemText)} einfügen`,
  },
  "el-GR": {
    dragItem: (v) => `Μεταφορά ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Μεταφορά σε ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} επιλεγμένο στοιχείο`, other: () => `${f.number(Number(v?.count))} επιλεγμένα στοιχεία` })}`,
    dragDescriptionKeyboard: "Πατήστε Enter για έναρξη της μεταφοράς.",
    dragDescriptionKeyboardAlt: "Πατήστε Alt + Enter για έναρξη της μεταφοράς.",
    dragDescriptionTouch: "Πατήστε δύο φορές για έναρξη της μεταφοράς.",
    dragDescriptionVirtual: "Κάντε κλικ για να ξεκινήσετε τη μεταφορά.",
    dragDescriptionLongPress: "Πατήστε παρατεταμένα για να ξεκινήσετε τη μεταφορά.",
    dragSelectedKeyboard: (v, f) =>
      `Πατήστε Enter για να σύρετε ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} επιλεγμένο στοιχείο`, other: () => `${f.number(Number(v?.count))} επιλεγμένα στοιχεία` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Πατήστε Alt + Enter για να σύρετε ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} επιλεγμένο στοιχείο`, other: () => `${f.number(Number(v?.count))} επιλεγμένα στοιχεία` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Πατήστε παρατεταμένα για να σύρετε ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} επιλεγμένο στοιχείο`, other: () => `${f.number(Number(v?.count))} επιλεγμένα στοιχεία` })}.`,
    dragStartedKeyboard:
      "Η μεταφορά ξεκίνησε. Πατήστε το πλήκτρο Tab για να μεταβείτε σε έναν προορισμό απόθεσης και, στη συνέχεια, πατήστε Enter για απόθεση ή πατήστε Escape για ακύρωση.",
    dragStartedTouch:
      "Η μεταφορά ξεκίνησε. Μεταβείτε σε έναν προορισμό απόθεσης και, στη συνέχεια, πατήστε δύο φορές για απόθεση.",
    dragStartedVirtual:
      "Η μεταφορά ξεκίνησε. Μεταβείτε σε έναν προορισμό απόθεσης και, στη συνέχεια, κάντε κλικ ή πατήστε Enter για απόθεση.",
    endDragKeyboard: "Μεταφορά σε εξέλιξη. Πατήστε Enter για ακύρωση της μεταφοράς.",
    endDragTouch: "Μεταφορά σε εξέλιξη. Πατήστε δύο φορές για ακύρωση της μεταφοράς.",
    endDragVirtual: "Μεταφορά σε εξέλιξη. Κάντε κλικ για ακύρωση της μεταφοράς.",
    dropDescriptionKeyboard: "Πατήστε Enter για απόθεση. Πατήστε Escape για ακύρωση της μεταφοράς.",
    dropDescriptionTouch: "Πατήστε δύο φορές για απόθεση.",
    dropDescriptionVirtual: "Κάντε κλικ για απόθεση.",
    dropCanceled: "Η απόθεση ακυρώθηκε.",
    dropComplete: "Η απόθεση ολοκληρώθηκε.",
    dropIndicator: "δείκτης απόθεσης",
    dropOnRoot: "Απόθεση σε",
    dropOnItem: (v) => `Απόθεση σε ${text(v?.itemText)}`,
    insertBefore: (v) => `Εισαγωγή πριν από ${text(v?.itemText)}`,
    insertBetween: (v) =>
      `Εισαγωγή μεταξύ ${text(v?.beforeItemText)} και ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Εισαγωγή μετά από ${text(v?.itemText)}`,
  },
  "en-US": {
    dragItem: (v) => `Drag ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Drag ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} selected item`, other: () => `${f.number(Number(v?.count))} selected items` })}`,
    dragDescriptionKeyboard: "Press Enter to start dragging.",
    dragDescriptionKeyboardAlt: "Press Alt + Enter to start dragging.",
    dragDescriptionTouch: "Double tap to start dragging.",
    dragDescriptionVirtual: "Click to start dragging.",
    dragDescriptionLongPress: "Long press to start dragging.",
    dragSelectedKeyboard: (v, f) =>
      `Press Enter to drag ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} selected item`, other: () => `${f.number(Number(v?.count))} selected items` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Press Alt + Enter to drag ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} selected item`, other: () => `${f.number(Number(v?.count))} selected items` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Long press to drag ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} selected item`, other: () => `${f.number(Number(v?.count))} selected items` })}.`,
    dragStartedKeyboard:
      "Started dragging. Press Tab to navigate to a drop target, then press Enter to drop, or press Escape to cancel.",
    dragStartedTouch: "Started dragging. Navigate to a drop target, then double tap to drop.",
    dragStartedVirtual:
      "Started dragging. Navigate to a drop target, then click or press Enter to drop.",
    endDragKeyboard: "Dragging. Press Enter to cancel drag.",
    endDragTouch: "Dragging. Double tap to cancel drag.",
    endDragVirtual: "Dragging. Click to cancel drag.",
    dropDescriptionKeyboard: "Press Enter to drop. Press Escape to cancel drag.",
    dropDescriptionTouch: "Double tap to drop.",
    dropDescriptionVirtual: "Click to drop.",
    dropCanceled: "Drop canceled.",
    dropComplete: "Drop complete.",
    dropIndicator: "drop indicator",
    dropOnRoot: "Drop on",
    dropOnItem: (v) => `Drop on ${text(v?.itemText)}`,
    insertBefore: (v) => `Insert before ${text(v?.itemText)}`,
    insertBetween: (v) => `Insert between ${text(v?.beforeItemText)} and ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Insert after ${text(v?.itemText)}`,
  },
  "es-ES": {
    dragItem: (v) => `Arrastrar ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Arrastrar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} elemento seleccionado`, other: () => `${f.number(Number(v?.count))} elementos seleccionados` })}`,
    dragDescriptionKeyboard: "Pulse Intro para empezar a arrastrar.",
    dragDescriptionKeyboardAlt: "Pulse Intro para empezar a arrastrar.",
    dragDescriptionTouch: "Pulse dos veces para iniciar el arrastre.",
    dragDescriptionVirtual: "Haga clic para iniciar el arrastre.",
    dragDescriptionLongPress: "Mantenga pulsado para comenzar a arrastrar.",
    dragSelectedKeyboard: (v, f) =>
      `Pulse Intro para arrastrar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} elemento seleccionado`, other: () => `${f.number(Number(v?.count))} elementos seleccionados` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Pulse Alt + Intro para arrastrar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} elemento seleccionado`, other: () => `${f.number(Number(v?.count))} elementos seleccionados` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Mantenga pulsado para arrastrar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} elemento seleccionado`, other: () => `${f.number(Number(v?.count))} elementos seleccionados` })}.`,
    dragStartedKeyboard:
      "Se ha empezado a arrastrar. Pulse el tabulador para ir al destino donde se vaya a colocar y, a continuación, pulse Intro para soltar, o pulse Escape para cancelar.",
    dragStartedTouch:
      "Se ha empezado a arrastrar. Vaya al destino donde se vaya a colocar y, a continuación, pulse dos veces para soltar.",
    dragStartedVirtual:
      "Se ha empezado a arrastrar. Vaya al destino donde se vaya a colocar y, a continuación, haga clic o pulse Intro para soltar.",
    endDragKeyboard: "Arrastrando. Pulse Intro para cancelar el arrastre.",
    endDragTouch: "Arrastrando. Pulse dos veces para cancelar el arrastre.",
    endDragVirtual: "Arrastrando. Haga clic para cancelar el arrastre.",
    dropDescriptionKeyboard: "Pulse Intro para soltar. Pulse Escape para cancelar el arrastre.",
    dropDescriptionTouch: "Pulse dos veces para soltar.",
    dropDescriptionVirtual: "Haga clic para soltar.",
    dropCanceled: "Se ha cancelado la colocación.",
    dropComplete: "Colocación finalizada.",
    dropIndicator: "indicador de colocación",
    dropOnRoot: "Soltar en",
    dropOnItem: (v) => `Soltar en ${text(v?.itemText)}`,
    insertBefore: (v) => `Insertar antes de ${text(v?.itemText)}`,
    insertBetween: (v) => `Insertar entre ${text(v?.beforeItemText)} y ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Insertar después de ${text(v?.itemText)}`,
  },
  "et-EE": {
    dragItem: (v) => `Lohista ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Lohista ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valitud üksust`, other: () => `${f.number(Number(v?.count))} valitud üksust` })}`,
    dragDescriptionKeyboard: "Lohistamise alustamiseks vajutage klahvi Enter.",
    dragDescriptionKeyboardAlt:
      "Lohistamise alustamiseks vajutage klahvikombinatsiooni Alt + Enter.",
    dragDescriptionTouch: "Topeltpuudutage lohistamise alustamiseks.",
    dragDescriptionVirtual: "Klõpsake lohistamise alustamiseks.",
    dragDescriptionLongPress: "Vajutage pikalt lohistamise alustamiseks.",
    dragSelectedKeyboard: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valitud üksuse`, other: () => `${f.number(Number(v?.count))} valitud üksuse` })} lohistamiseks vajutage sisestusklahvi Enter.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Lohistamiseks vajutage klahvikombinatsiooni Alt + Enter ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valitud üksuse`, other: () => `${f.number(Number(v?.count))} valitud üksuse` })} jaoks.`,
    dragSelectedLongPress: (v, f) =>
      `Pikk vajutus ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valitud üksuse`, other: () => `${f.number(Number(v?.count))} valitud üksuse` })} lohistamiseks.`,
    dragStartedKeyboard:
      "Alustati lohistamist. Kukutamise sihtmärgi juurde navigeerimiseks vajutage klahvi Tab, seejärel vajutage kukutamiseks klahvi Enter või loobumiseks klahvi Escape.",
    dragStartedTouch:
      "Alustati lohistamist. Navigeerige kukutamise sihtmärgi juurde ja topeltpuudutage kukutamiseks.",
    dragStartedVirtual:
      "Alustati lohistamist. Navigeerige kukutamise sihtmärgi juurde ja kukutamiseks klõpsake või vajutage klahvi Enter.",
    endDragKeyboard: "Lohistamine. Lohistamisest loobumiseks vajutage klahvi Enter.",
    endDragTouch: "Lohistamine. Lohistamisest loobumiseks topeltpuudutage.",
    endDragVirtual: "Lohistamine. Lohistamisest loobumiseks klõpsake.",
    dropDescriptionKeyboard:
      "Kukutamiseks vajutage klahvi Enter. Lohistamisest loobumiseks vajutage klahvi Escape.",
    dropDescriptionTouch: "Kukutamiseks topeltpuudutage.",
    dropDescriptionVirtual: "Kukutamiseks klõpsake.",
    dropCanceled: "Lohistamisest loobuti.",
    dropComplete: "Lohistamine on tehtud.",
    dropIndicator: "lohistamise indikaator",
    dropOnRoot: "Kukuta asukohta",
    dropOnItem: (v) => `Kukuta asukohta ${text(v?.itemText)}`,
    insertBefore: (v) => `Sisesta ${text(v?.itemText)} ette`,
    insertBetween: (v) => `Sisesta ${text(v?.beforeItemText)} ja ${text(v?.afterItemText)} vahele`,
    insertAfter: (v) => `Sisesta ${text(v?.itemText)} järele`,
  },
  "fi-FI": {
    dragItem: (v) => `Vedä kohdetta ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Vedä ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valittua kohdetta`, other: () => `${f.number(Number(v?.count))} valittua kohdetta` })}`,
    dragDescriptionKeyboard: "Aloita vetäminen painamalla Enter-näppäintä.",
    dragDescriptionKeyboardAlt: "Aloita vetäminen painamalla Alt + Enter -näppäinyhdistelmää.",
    dragDescriptionTouch: "Aloita vetäminen kaksoisnapauttamalla.",
    dragDescriptionVirtual: "Aloita vetäminen napsauttamalla.",
    dragDescriptionLongPress: "Aloita vetäminen pitämällä painettuna.",
    dragSelectedKeyboard: (v, f) =>
      `Vedä painamalla Enter ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valittu kohde`, other: () => `${f.number(Number(v?.count))} valittua kohdetta` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Vedä painamalla Alt + Enter ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valittu kohde`, other: () => `${f.number(Number(v?.count))} valittua kohdetta` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Vedä pitämällä painettuna ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valittu kohde`, other: () => `${f.number(Number(v?.count))} valittua kohdetta` })}.`,
    dragStartedKeyboard:
      "Vetäminen aloitettu. Siirry pudotuskohteeseen painamalla sarkainnäppäintä ja sitten pudota painamalla Enter-näppäintä tai peruuta painamalla Escape-näppäintä.",
    dragStartedTouch:
      "Vetäminen aloitettu. Siirry pudotuskohteeseen ja pudota kaksoisnapauttamalla.",
    dragStartedVirtual:
      "Vetäminen aloitettu. Siirry pudotuskohteeseen ja pudota napsauttamalla tai painamalla Enter-näppäintä.",
    endDragKeyboard: "Vedetään. Peruuta vetäminen painamalla Enter-näppäintä.",
    endDragTouch: "Vedetään. Peruuta vetäminen kaksoisnapauttamalla.",
    endDragVirtual: "Vedetään. Peruuta vetäminen napsauttamalla.",
    dropDescriptionKeyboard:
      "Pudota painamalla Enter-näppäintä. Peruuta vetäminen painamalla Escape-näppäintä.",
    dropDescriptionTouch: "Pudota kaksoisnapauttamalla.",
    dropDescriptionVirtual: "Pudota napsauttamalla.",
    dropCanceled: "Pudotus peruutettu.",
    dropComplete: "Pudotus suoritettu.",
    dropIndicator: "pudotuksen ilmaisin",
    dropOnRoot: "Pudota kohteeseen",
    dropOnItem: (v) => `Pudota kohteeseen ${text(v?.itemText)}`,
    insertBefore: (v) => `Lisää ennen kohdetta ${text(v?.itemText)}`,
    insertBetween: (v) =>
      `Lisää kohteiden ${text(v?.beforeItemText)} ja ${text(v?.afterItemText)} väliin`,
    insertAfter: (v) => `Lisää kohteen ${text(v?.itemText)} jälkeen`,
  },
  "fr-FR": {
    dragItem: (v) => `Déplacer ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Déplacer ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} élément sélectionné`, other: () => `${f.number(Number(v?.count))} éléments sélectionnés` })}`,
    dragDescriptionKeyboard: "Appuyez sur Entrée pour commencer le déplacement.",
    dragDescriptionKeyboardAlt: "Appuyez sur Alt + Entrée pour commencer à faire glisser.",
    dragDescriptionTouch: "Touchez deux fois pour commencer le déplacement.",
    dragDescriptionVirtual: "Cliquez pour commencer le déplacement.",
    dragDescriptionLongPress: "Appuyez de manière prolongée pour commencer à faire glisser.",
    dragSelectedKeyboard: (v, f) =>
      `Appuyez sur Entrée pour faire glisser ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} élément sélectionné`, other: () => `${f.number(Number(v?.count))} éléments sélectionnés` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Appuyez sur Alt + Entrée pour faire glisser ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} élément sélectionné`, other: () => `${f.number(Number(v?.count))} éléments sélectionnés` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Appuyez de manière prolongée pour faire glisser ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} élément sélectionné`, other: () => `${f.number(Number(v?.count))} éléments sélectionnés` })}.`,
    dragStartedKeyboard:
      "Déplacement commencé. Appuyez sur Tabulation pour accéder à une cible de dépôt, puis appuyez sur Entrée pour déposer, ou appuyez sur Échap pour annuler.",
    dragStartedTouch:
      "Déplacement commencé. Accédez à une cible de dépôt, puis touchez deux fois pour déposer.",
    dragStartedVirtual:
      "Déplacement commencé. Accédez à une cible de dépôt, puis cliquez ou appuyez sur Entrée pour déposer.",
    endDragKeyboard: "Déplacement. Appuyez sur Entrée pour annuler le déplacement.",
    endDragTouch: "Déplacement. Touchez deux fois pour annuler le déplacement.",
    endDragVirtual: "Déplacement. Cliquez pour annuler le déplacement.",
    dropDescriptionKeyboard:
      "Appuyez sur Entrée pour déposer. Appuyez sur Échap pour annuler le déplacement.",
    dropDescriptionTouch: "Touchez deux fois pour déposer.",
    dropDescriptionVirtual: "Cliquez pour déposer.",
    dropCanceled: "Dépôt annulé.",
    dropComplete: "Dépôt terminé.",
    dropIndicator: "indicateur de dépôt",
    dropOnRoot: "Déposer sur",
    dropOnItem: (v) => `Déposer sur ${text(v?.itemText)}`,
    insertBefore: (v) => `Insérer avant ${text(v?.itemText)}`,
    insertBetween: (v) => `Insérer entre ${text(v?.beforeItemText)} et ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Insérer après ${text(v?.itemText)}`,
  },
  "he-IL": {
    dragItem: (v) => `גרור את ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `גרור ${f.plural(Number(v?.count), { one: () => `פריט נבחר ${f.number(Number(v?.count))}`, other: () => `${f.number(Number(v?.count))} פריטים שנבחרו` })}`,
    dragDescriptionKeyboard: "הקש על Enter כדי להתחיל לגרור.",
    dragDescriptionKeyboardAlt: "הקש Alt + Enter כדי להתחיל לגרור.",
    dragDescriptionTouch: "הקש פעמיים כדי להתחיל בגרירה.",
    dragDescriptionVirtual: "לחץ כדי להתחיל לגרור.",
    dragDescriptionLongPress: "לחץ לחיצה ארוכה כדי להתחיל לגרור.",
    dragSelectedKeyboard: (v, f) =>
      `הקש על Enter כדי לגרור ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} פריט שנבחר`, other: () => `${f.number(Number(v?.count))} פריטים שנבחרו` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `הקש Alt + Enter כדי לגרור ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} פריט שנבחר`, other: () => `${f.number(Number(v?.count))} פריטים שנבחרו` })}.`,
    dragSelectedLongPress: (v, f) =>
      `לחץ לחיצה ארוכה כדי לגרור ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} פריט שנבחר`, other: () => `${f.number(Number(v?.count))} פריטים שנבחרו` })}.`,
    dragStartedKeyboard:
      "התחלת לגרור. הקש על Tab כדי לנווט לנקודת הגרירה ולאחר מכן הקש על Enter כדי לשחרר או על Escape כדי לבטל.",
    dragStartedTouch: "התחלת לגרור. נווט לנקודת השחרור ולאחר מכן הקש פעמיים כדי לשחרר.",
    dragStartedVirtual: "התחלת לגרור. נווט לנקודת השחרור ולאחר מכן לחץ או הקש על Enter כדי לשחרר.",
    endDragKeyboard: "גורר. הקש על Enter כדי לבטל את הגרירה.",
    endDragTouch: "גורר. הקש פעמיים כדי לבטל את הגרירה.",
    endDragVirtual: "גורר. לחץ כדי לבטל את הגרירה.",
    dropDescriptionKeyboard: "הקש על Enter כדי לשחרר. הקש על Escape כדי לבטל את הגרירה.",
    dropDescriptionTouch: "הקש פעמיים כדי לשחרר.",
    dropDescriptionVirtual: "לחץ כדי לשחרר.",
    dropCanceled: "השחרור בוטל.",
    dropComplete: "השחרור הושלם.",
    dropIndicator: "מחוון שחרור",
    dropOnRoot: "שחרר על",
    dropOnItem: (v) => `שחרר על ${text(v?.itemText)}`,
    insertBefore: (v) => `הוסף לפני ${text(v?.itemText)}`,
    insertBetween: (v) => `הוסף בין ${text(v?.beforeItemText)} לבין ${text(v?.afterItemText)}`,
    insertAfter: (v) => `הוסף אחרי ${text(v?.itemText)}`,
  },
  "hr-HR": {
    dragItem: (v) => `Povucite stavku ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Povucite ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} odabranu stavku`, other: () => `ovoliko odabranih stavki: ${f.number(Number(v?.count))}` })}`,
    dragDescriptionKeyboard: "Pritisnite Enter da biste počeli povlačiti.",
    dragDescriptionKeyboardAlt: "Pritisnite Alt + Enter za početak povlačenja.",
    dragDescriptionTouch: "Dvaput dodirnite da biste počeli povlačiti.",
    dragDescriptionVirtual: "Kliknite da biste počeli povlačiti.",
    dragDescriptionLongPress: "Dugo pritisnite za početak povlačenja.",
    dragSelectedKeyboard: (v, f) =>
      `Pritisnite Enter za povlačenje ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} odabrana stavka`, other: () => `${f.number(Number(v?.count))} odabrane stavke` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Pritisnite Alt + Enter za povlačenje ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} odabrana stavka`, other: () => `${f.number(Number(v?.count))} odabrane stavke` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Dugo pritisnite za povlačenje ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} odabrana stavka`, other: () => `${f.number(Number(v?.count))} odabrane stavke` })}.`,
    dragStartedKeyboard:
      "Počeli ste povlačiti. Pritisnite tipku tabulatora da biste došli do cilja ispuštanja, a zatim Enter da biste ispustili stavku ili Escape da biste prekinuli povlačenje.",
    dragStartedTouch:
      "Počeli ste povlačiti. Dođite do cilja ispuštanja, a zatim dvaput dodirnite da biste ispustili stavku.",
    dragStartedVirtual:
      "Počeli ste povlačiti. Dođite do cilja ispuštanja, a zatim kliknite ili pritisnite Enter da biste ispustili stavku.",
    endDragKeyboard: "Povlačenje. Pritisnite Enter da biste prekinuli povlačenje.",
    endDragTouch: "Povlačenje. Dvaput dodirnite da biste prekinuli povlačenje.",
    endDragVirtual: "Povlačenje. Kliknite da biste prekinuli povlačenje.",
    dropDescriptionKeyboard:
      "Pritisnite Enter da biste ispustili stavku. Pritisnite Escape da biste prekinuli povlačenje.",
    dropDescriptionTouch: "Dvaput dodirnite da biste ispustili stavku.",
    dropDescriptionVirtual: "Kliknite da biste ispustili stavku.",
    dropCanceled: "Povlačenje je prekinuto.",
    dropComplete: "Ispuštanje je dovršeno.",
    dropIndicator: "pokazatelj ispuštanja",
    dropOnRoot: "Ispustite na",
    dropOnItem: (v) => `Ispustite na stavku ${text(v?.itemText)}`,
    insertBefore: (v) => `Ispustite ispred stavke ${text(v?.itemText)}`,
    insertBetween: (v) =>
      `Umetnite između stavki ${text(v?.beforeItemText)} i ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Umetnite iza stavke ${text(v?.itemText)}`,
  },
  "hu-HU": {
    dragItem: (v) => `${text(v?.itemText)} húzása`,
    dragSelectedItems: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} kijelölt elem`, other: () => `${f.number(Number(v?.count))} kijelölt elem` })} húzása`,
    dragDescriptionKeyboard: "Nyomja le az Enter billentyűt a húzás megkezdéséhez.",
    dragDescriptionKeyboardAlt: "Nyomja le az Alt + Enter billentyűket a húzás megkezdéséhez.",
    dragDescriptionTouch: "Koppintson duplán a húzás megkezdéséhez.",
    dragDescriptionVirtual: "Kattintson a húzás megkezdéséhez.",
    dragDescriptionLongPress: "Hosszan nyomja meg a húzás elindításához.",
    dragSelectedKeyboard: (v, f) =>
      `Nyomja meg az Entert ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} kijelölt elem`, other: () => `${f.number(Number(v?.count))} kijelölt elem` })} húzásához.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Nyomja meg az Alt + Enter billentyűket ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} kijelölt elem`, other: () => `${f.number(Number(v?.count))} kijelölt elem` })} húzásához.`,
    dragSelectedLongPress: (v, f) =>
      `Tartsa lenyomva hosszan ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} kijelölt elem`, other: () => `${f.number(Number(v?.count))} kijelölt elem` })} húzásához.`,
    dragStartedKeyboard:
      "Húzás megkezdve. Nyomja le a Tab billentyűt az elengedési célhoz navigálásához, majd nyomja le az Enter billentyűt az elengedéshez, vagy nyomja le az Escape billentyűt a megszakításhoz.",
    dragStartedTouch:
      "Húzás megkezdve. Navigáljon egy elengedési célhoz, majd koppintson duplán az elengedéshez.",
    dragStartedVirtual:
      "Húzás megkezdve. Navigáljon egy elengedési célhoz, majd kattintson vagy nyomja le az Enter billentyűt az elengedéshez.",
    endDragKeyboard: "Húzás folyamatban. Nyomja le az Enter billentyűt a húzás megszakításához.",
    endDragTouch: "Húzás folyamatban. Koppintson duplán a húzás megszakításához.",
    endDragVirtual: "Húzás folyamatban. Kattintson a húzás megszakításához.",
    dropDescriptionKeyboard:
      "Nyomja le az Enter billentyűt az elengedéshez. Nyomja le az Escape billentyűt a húzás megszakításához.",
    dropDescriptionTouch: "Koppintson duplán az elengedéshez.",
    dropDescriptionVirtual: "Kattintson az elengedéshez.",
    dropCanceled: "Elengedés megszakítva.",
    dropComplete: "Elengedés teljesítve.",
    dropIndicator: "elengedésjelző",
    dropOnRoot: "Elengedés erre:",
    dropOnItem: (v) => `Elengedés erre: ${text(v?.itemText)}`,
    insertBefore: (v) => `Beszúrás ${text(v?.itemText)} elé`,
    insertBetween: (v) => `Beszúrás ${text(v?.beforeItemText)} és ${text(v?.afterItemText)} közé`,
    insertAfter: (v) => `Beszúrás ${text(v?.itemText)} után`,
  },
  "it-IT": {
    dragItem: (v) => `Trascina ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Trascina ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} altro elemento selezionato`, other: () => `${f.number(Number(v?.count))} altri elementi selezionati` })}`,
    dragDescriptionKeyboard: "Premi Invio per iniziare a trascinare.",
    dragDescriptionKeyboardAlt: "Premi Alt + Invio per iniziare a trascinare.",
    dragDescriptionTouch: "Tocca due volte per iniziare a trascinare.",
    dragDescriptionVirtual: "Fai clic per iniziare a trascinare.",
    dragDescriptionLongPress: "Premi a lungo per iniziare a trascinare.",
    dragSelectedKeyboard: (v, f) =>
      `Premi Invio per trascinare ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} elemento selezionato`, other: () => `${f.number(Number(v?.count))} elementi selezionati` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Premi Alt + Invio per trascinare ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} elemento selezionato`, other: () => `${f.number(Number(v?.count))} elementi selezionati` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Premi a lungo per trascinare ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} elemento selezionato`, other: () => `${f.number(Number(v?.count))} elementi selezionati` })}.`,
    dragStartedKeyboard:
      "Hai iniziato a trascinare. Premi Tab per arrivare sull’area di destinazione, quindi premi Invio per rilasciare o Esc per annullare.",
    dragStartedTouch:
      "Hai iniziato a trascinare. Arriva sull’area di destinazione, quindi tocca due volte per rilasciare.",
    dragStartedVirtual:
      "Hai iniziato a trascinare. Arriva sull’area di destinazione, quindi fai clic o premi Invio per rilasciare.",
    endDragKeyboard: "Trascinamento. Premi Invio per annullare.",
    endDragTouch: "Trascinamento. Tocca due volte per annullare.",
    endDragVirtual: "Trascinamento. Fai clic per annullare.",
    dropDescriptionKeyboard: "Premi Invio per rilasciare. Premi Esc per annullare.",
    dropDescriptionTouch: "Tocca due volte per rilasciare.",
    dropDescriptionVirtual: "Fai clic per rilasciare.",
    dropCanceled: "Rilascio annullato.",
    dropComplete: "Rilascio completato.",
    dropIndicator: "indicatore di rilascio",
    dropOnRoot: "Rilascia su",
    dropOnItem: (v) => `Rilascia su ${text(v?.itemText)}`,
    insertBefore: (v) => `Inserisci prima di ${text(v?.itemText)}`,
    insertBetween: (v) => `Inserisci tra ${text(v?.beforeItemText)} e ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Inserisci dopo ${text(v?.itemText)}`,
  },
  "ja-JP": {
    dragItem: (v) => `${text(v?.itemText)} をドラッグ`,
    dragSelectedItems: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 個の選択項目`, other: () => `${f.number(Number(v?.count))} 個の選択項目` })} をドラッグ`,
    dragDescriptionKeyboard: "Enter キーを押してドラッグを開始してください。",
    dragDescriptionKeyboardAlt: "Alt+Enter キーを押してドラッグを開始します。",
    dragDescriptionTouch: "ダブルタップしてドラッグを開始します。",
    dragDescriptionVirtual: "クリックしてドラッグを開始します。",
    dragDescriptionLongPress: "長押ししてドラッグを開始します。",
    dragSelectedKeyboard: (v, f) =>
      `Enter キーを押して、${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 選択した項目`, other: () => `${f.number(Number(v?.count))} 選択した項目` })}をドラッグします。`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Alt+Enter キーを押して、${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 選択した項目`, other: () => `${f.number(Number(v?.count))} 選択した項目` })}をドラッグします。`,
    dragSelectedLongPress: (v, f) =>
      `長押しして、${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 選択した項目`, other: () => `${f.number(Number(v?.count))} 選択した項目` })}をドラッグします。`,
    dragStartedKeyboard:
      "ドラッグを開始します。Tab キーを押してドロップターゲットにいどうし、Enter キーを押してドロップするか、Esc キーを押してキャンセルします。",
    dragStartedTouch:
      "ドラッグを開始しました。ドロップのターゲットに移動し、ダブルタップしてドロップします。",
    dragStartedVirtual:
      "ドラッグを開始しました。ドロップのターゲットに移動し、クリックまたは Enter キーを押してドロップします。",
    endDragKeyboard: "ドラッグしています。Enter キーを押してドラッグをキャンセルします。",
    endDragTouch: "ドラッグしています。ダブルタップしてドラッグをキャンセルします。",
    endDragVirtual: "ドラッグしています。クリックしてドラッグをキャンセルします。",
    dropDescriptionKeyboard:
      "Enter キーを押してドロップします。Esc キーを押してドラッグをキャンセルします。",
    dropDescriptionTouch: "ダブルタップしてドロップします。",
    dropDescriptionVirtual: "クリックしてドロップします。",
    dropCanceled: "ドロップがキャンセルされました。",
    dropComplete: "ドロップが完了しました。",
    dropIndicator: "ドロップインジケーター",
    dropOnRoot: "ドロップ場所",
    dropOnItem: (v) => `${text(v?.itemText)} にドロップ`,
    insertBefore: (v) => `${text(v?.itemText)} の前に挿入`,
    insertBetween: (v) => `${text(v?.beforeItemText)} と ${text(v?.afterItemText)} の間に挿入`,
    insertAfter: (v) => `${text(v?.itemText)} の後に挿入`,
  },
  "ko-KR": {
    dragItem: (v) => `${text(v?.itemText)} 드래그`,
    dragSelectedItems: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))}개 선택 항목`, other: () => `${f.number(Number(v?.count))}개 선택 항목` })} 드래그`,
    dragDescriptionKeyboard: "드래그를 시작하려면 Enter를 누르세요.",
    dragDescriptionKeyboardAlt: "드래그를 시작하려면 Alt + Enter를 누르십시오.",
    dragDescriptionTouch: "드래그를 시작하려면 더블 탭하세요.",
    dragDescriptionVirtual: "드래그를 시작하려면 클릭하세요.",
    dragDescriptionLongPress: "드래그를 시작하려면 길게 누르십시오.",
    dragSelectedKeyboard: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))}개 선택 항목`, other: () => `${f.number(Number(v?.count))}개 선택 항목` })}을 드래그하려면 Enter를 누르십시오.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))}개 선택 항목`, other: () => `${f.number(Number(v?.count))}개 선택 항목` })}을 드래그하려면 Alt + Enter를 누르십시오.`,
    dragSelectedLongPress: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))}개 선택 항목`, other: () => `${f.number(Number(v?.count))}개 선택 항목` })}을 드래그하려면 길게 누르십시오.`,
    dragStartedKeyboard:
      "드래그가 시작되었습니다. Tab을 눌러 드롭 대상으로 이동한 다음 Enter를 눌러 드롭하거나 Esc를 눌러 취소하세요.",
    dragStartedTouch: "드래그가 시작되었습니다. 드롭 대상으로 이동한 다음 더블 탭하여 드롭하세요.",
    dragStartedVirtual:
      "드래그가 시작되었습니다. 드롭 대상으로 이동한 다음 클릭하거나 Enter를 눌러 드롭하세요.",
    endDragKeyboard: "드래그 중입니다. 드래그를 취소하려면 Enter를 누르세요.",
    endDragTouch: "드래그 중입니다. 드래그를 취소하려면 더블 탭하세요.",
    endDragVirtual: "드래그 중입니다. 드래그를 취소하려면 클릭하세요.",
    dropDescriptionKeyboard: "드롭하려면 Enter를 누르세요. 드래그를 취소하려면 Esc를 누르세요.",
    dropDescriptionTouch: "더블 탭하여 드롭하세요.",
    dropDescriptionVirtual: "드롭하려면 클릭하세요.",
    dropCanceled: "드롭이 취소되었습니다.",
    dropComplete: "드롭이 완료되었습니다.",
    dropIndicator: "드롭 표시기",
    dropOnRoot: "드롭 대상",
    dropOnItem: (v) => `${text(v?.itemText)}에 드롭`,
    insertBefore: (v) => `${text(v?.itemText)} 이전에 삽입`,
    insertBetween: (v) => `${text(v?.beforeItemText)} 및 ${text(v?.afterItemText)} 사이에 삽입`,
    insertAfter: (v) => `${text(v?.itemText)} 이후에 삽입`,
  },
  "lt-LT": {
    dragItem: (v) => `Vilkti ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Vilkti ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} pasirinktą elementą`, other: () => `${f.number(Number(v?.count))} pasirinktus elementus` })}`,
    dragDescriptionKeyboard: "Paspauskite „Enter“, kad pradėtumėte vilkti.",
    dragDescriptionKeyboardAlt: "Paspauskite „Alt + Enter“, kad pradėtumėte vilkti.",
    dragDescriptionTouch: "Palieskite dukart, kad pradėtumėte vilkti.",
    dragDescriptionVirtual: "Spustelėkite, kad pradėtumėte vilkti.",
    dragDescriptionLongPress: "Palaikykite nuspaudę, kad pradėtumėte vilkti.",
    dragSelectedKeyboard: (v, f) =>
      `Paspauskite „Enter“, jei norite nuvilkti ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} pasirinktą elementą`, other: () => `${f.number(Number(v?.count))} pasirinktus elementus` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Paspauskite „Alt + Enter“, kad nuvilktumėte ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} pasirinktą elementą`, other: () => `${f.number(Number(v?.count))} pasirinktus elementus` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Nuspaudę palaikykite, kad nuvilktumėte ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} pasirinktą elementą`, other: () => `${f.number(Number(v?.count))} pasirinktus elementus` })}.`,
    dragStartedKeyboard:
      "Pradėta vilkti. Paspauskite „Tab“, kad pereitumėte į tiesioginę paskirties vietą, tada paspauskite „Enter“, kad numestumėte, arba „Escape“, kad atšauktumėte.",
    dragStartedTouch:
      "Pradėta vilkti. Eikite į tiesioginę paskirties vietą, tada palieskite dukart, kad numestumėte.",
    dragStartedVirtual:
      "Pradėta vilkti. Eikite į tiesioginę paskirties vietą ir spustelėkite arba paspauskite „Enter“, kad numestumėte.",
    endDragKeyboard: "Velkama. Paspauskite „Enter“, kad atšauktumėte vilkimą.",
    endDragTouch: "Velkama. Spustelėkite dukart, kad atšauktumėte vilkimą.",
    endDragVirtual: "Velkama. Spustelėkite, kad atšauktumėte vilkimą.",
    dropDescriptionKeyboard:
      "Paspauskite „Enter“, kad numestumėte. Paspauskite „Escape“, kad atšauktumėte vilkimą.",
    dropDescriptionTouch: "Palieskite dukart, kad numestumėte.",
    dropDescriptionVirtual: "Spustelėkite, kad numestumėte.",
    dropCanceled: "Numetimas atšauktas.",
    dropComplete: "Numesta.",
    dropIndicator: "numetimo indikatorius",
    dropOnRoot: "Numesti ant",
    dropOnItem: (v) => `Numesti ant ${text(v?.itemText)}`,
    insertBefore: (v) => `Įterpti prieš ${text(v?.itemText)}`,
    insertBetween: (v) => `Įterpti tarp ${text(v?.beforeItemText)} ir ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Įterpti po ${text(v?.itemText)}`,
  },
  "lv-LV": {
    dragItem: (v) => `Velciet ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Velciet ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} atlasīto vienumu`, other: () => `${f.number(Number(v?.count))} atlasītos vienumus` })}`,
    dragDescriptionKeyboard: "Nospiediet Enter, lai sāktu vilkšanu.",
    dragDescriptionKeyboardAlt: "Nospiediet taustiņu kombināciju Alt+Enter, lai sāktu vilkšanu.",
    dragDescriptionTouch: "Veiciet dubultskārienu, lai sāktu vilkšanu.",
    dragDescriptionVirtual: "Noklikšķiniet, lai sāktu vilkšanu.",
    dragDescriptionLongPress: "Turiet nospiestu, lai sāktu vilkšanu.",
    dragSelectedKeyboard: (v, f) =>
      `Nospiediet taustiņu Enter, lai vilktu ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} atlasīto vienumu`, other: () => `${f.number(Number(v?.count))} atlasītos vienumus` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Nospiediet taustiņu kombināciju Alt+Enter, lai vilktu ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} atlasīto vienumu`, other: () => `${f.number(Number(v?.count))} atlasītos vienumus` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Turiet nospiestu, lai vilktu ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} atlasīto vienumu`, other: () => `${f.number(Number(v?.count))} atlasītos vienumus` })}.`,
    dragStartedKeyboard:
      "Uzsākta vilkšana. Nospiediet taustiņu Tab, lai pārietu uz nomešanas mērķi, pēc tam nospiediet Enter, lai nomestu, vai nospiediet Escape, lai atceltu.",
    dragStartedTouch:
      "Uzsākta vilkšana. Pārejiet uz nomešanas mērķi, pēc tam veiciet dubultskārienu, lai nomestu.",
    dragStartedVirtual:
      "Uzsākta vilkšana. Pārejiet uz nomešanas mērķi, pēc tam nospiediet Enter, lai nomestu.",
    endDragKeyboard: "Notiek vilkšana. Nospiediet Enter, lai atceltu vilkšanu.",
    endDragTouch: "Notiek vilkšana. Veiciet dubultskārienu, lai atceltu vilkšanu.",
    endDragVirtual: "Notiek vilkšana. Noklikšķiniet, lai atceltu vilkšanu.",
    dropDescriptionKeyboard:
      "Nospiediet Enter, lai nomestu. Nospiediet Escape, lai atceltu vilkšanu.",
    dropDescriptionTouch: "Veiciet dubultskārienu, lai nomestu.",
    dropDescriptionVirtual: "Noklikšķiniet, lai nomestu.",
    dropCanceled: "Nomešana atcelta.",
    dropComplete: "Nomešana pabeigta.",
    dropIndicator: "nomešanas indikators",
    dropOnRoot: "Nometiet uz",
    dropOnItem: (v) => `Nometiet uz ${text(v?.itemText)}`,
    insertBefore: (v) => `Ievietojiet pirms ${text(v?.itemText)}`,
    insertBetween: (v) =>
      `Ievietojiet starp ${text(v?.beforeItemText)} un ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Ievietojiet pēc ${text(v?.itemText)}`,
  },
  "nb-NO": {
    dragItem: (v) => `Dra ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} merket element`, other: () => `${f.number(Number(v?.count))} merkede elementer` })}`,
    dragDescriptionKeyboard: "Trykk på Enter for å begynne å dra.",
    dragDescriptionKeyboardAlt: "Trykk på Alt + Enter for å begynne å dra.",
    dragDescriptionTouch: "Dobbelttrykk for å begynne å dra.",
    dragDescriptionVirtual: "Klikk for å begynne å dra.",
    dragDescriptionLongPress: "Trykk lenge for å begynne å dra.",
    dragSelectedKeyboard: (v, f) =>
      `Trykk Enter for å dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valgt element`, other: () => `${f.number(Number(v?.count))} valgte elementer` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Trykk på Alt + Enter for å dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valgt element`, other: () => `${f.number(Number(v?.count))} valgte elementer` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Trykk lenge for å dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valgt element`, other: () => `${f.number(Number(v?.count))} valgte elementer` })}.`,
    dragStartedKeyboard:
      "Begynte å dra. Trykk på Tab for å navigere til et mål, og trykk deretter på Enter for å slippe eller på Esc for å avbryte.",
    dragStartedTouch: "Begynte å dra. Naviger til et mål, og dobbelttrykk for å slippe.",
    dragStartedVirtual:
      "Begynte å dra. Naviger til et mål, og klikk eller trykk på Enter for å slippe.",
    endDragKeyboard: "Drar. Trykk på Enter hvis du vil avbryte.",
    endDragTouch: "Drar. Dobbelttrykk hvis du vil avbryte.",
    endDragVirtual: "Drar. Klikk hvis du vil avbryte.",
    dropDescriptionKeyboard:
      "Trykk på Enter for å slippe. Trykk på Esc hvis du vil avbryte draingen.",
    dropDescriptionTouch: "Dobbelttrykk for å slippe.",
    dropDescriptionVirtual: "Klikk for å slippe.",
    dropCanceled: "Avbrøt slipping.",
    dropComplete: "Slippingen er fullført.",
    dropIndicator: "slippeindikator",
    dropOnRoot: "Slipp på",
    dropOnItem: (v) => `Slipp på ${text(v?.itemText)}`,
    insertBefore: (v) => `Sett inn før ${text(v?.itemText)}`,
    insertBetween: (v) => `Sett inn mellom ${text(v?.beforeItemText)} og ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Sett inn etter ${text(v?.itemText)}`,
  },
  "nl-NL": {
    dragItem: (v) => `${text(v?.itemText)} slepen`,
    dragSelectedItems: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} geselecteerd item`, other: () => `${f.number(Number(v?.count))} geselecteerde items` })} slepen`,
    dragDescriptionKeyboard: "Druk op Enter om te slepen.",
    dragDescriptionKeyboardAlt: "Druk op Alt + Enter om te slepen.",
    dragDescriptionTouch: "Dubbeltik om te slepen.",
    dragDescriptionVirtual: "Klik om met slepen te starten.",
    dragDescriptionLongPress: "Houd lang ingedrukt om te slepen.",
    dragSelectedKeyboard: (v, f) =>
      `Druk op Enter om ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} geselecteerd item`, other: () => `${f.number(Number(v?.count))} geselecteerde items` })} te slepen.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Druk op Alt + Enter om ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} geselecteerd item`, other: () => `${f.number(Number(v?.count))} geselecteerde items` })} te slepen.`,
    dragSelectedLongPress: (v, f) =>
      `Houd lang ingedrukt om ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} geselecteerd item`, other: () => `${f.number(Number(v?.count))} geselecteerde items` })} te slepen.`,
    dragStartedKeyboard:
      "Begonnen met slepen. Druk op Tab om naar een locatie te gaan. Druk dan op Enter om neer te zetten, of op Esc om te annuleren.",
    dragStartedTouch:
      "Begonnen met slepen. Ga naar de gewenste locatie en dubbeltik om neer te zetten.",
    dragStartedVirtual:
      "Begonnen met slepen. Ga naar de gewenste locatie en klik of druk op Enter om neer te zetten.",
    endDragKeyboard: "Bezig met slepen. Druk op Enter om te annuleren.",
    endDragTouch: "Bezig met slepen. Dubbeltik om te annuleren.",
    endDragVirtual: "Bezig met slepen. Klik om te annuleren.",
    dropDescriptionKeyboard:
      "Druk op Enter om neer te zetten. Druk op Esc om het slepen te annuleren.",
    dropDescriptionTouch: "Dubbeltik om neer te zetten.",
    dropDescriptionVirtual: "Klik om neer te zetten.",
    dropCanceled: "Neerzetten geannuleerd.",
    dropComplete: "Neerzetten voltooid.",
    dropIndicator: "aanwijzer voor neerzetten",
    dropOnRoot: "Neerzetten op",
    dropOnItem: (v) => `Neerzetten op ${text(v?.itemText)}`,
    insertBefore: (v) => `Plaatsen vóór ${text(v?.itemText)}`,
    insertBetween: (v) => `Plaatsen tussen ${text(v?.beforeItemText)} en ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Plaatsen na ${text(v?.itemText)}`,
  },
  "pl-PL": {
    dragItem: (v) => `Przeciągnij ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Przeciągnij ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} wybrany element`, other: () => `${f.number(Number(v?.count))} wybranych elementów` })}`,
    dragDescriptionKeyboard: "Naciśnij Enter, aby rozpocząć przeciąganie.",
    dragDescriptionKeyboardAlt: "Naciśnij Alt + Enter, aby rozpocząć przeciąganie.",
    dragDescriptionTouch: "Dotknij dwukrotnie, aby rozpocząć przeciąganie.",
    dragDescriptionVirtual: "Kliknij, aby rozpocząć przeciąganie.",
    dragDescriptionLongPress: "Naciśnij i przytrzymaj, aby rozpocząć przeciąganie.",
    dragSelectedKeyboard: (v, f) =>
      `Naciśnij Enter, aby przeciągnąć ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} wybrany element`, other: () => `${f.number(Number(v?.count))} wybrane(-ych) elementy(-ów)` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Naciśnij Alt + Enter, aby przeciągnąć ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} wybrany element`, other: () => `${f.number(Number(v?.count))} wybrane(-ych) elementy(-ów)` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Naciśnij i przytrzymaj, aby przeciągnąć ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} wybrany element`, other: () => `${f.number(Number(v?.count))} wybrane(-ych) elementy(-ów)` })}.`,
    dragStartedKeyboard:
      "Rozpoczęto przeciąganie. Naciśnij Tab, aby wybrać miejsce docelowe, a następnie naciśnij Enter, aby upuścić, lub Escape, aby anulować.",
    dragStartedTouch:
      "Rozpoczęto przeciąganie. Wybierz miejsce, w którym chcesz upuścić element, a następnie dotknij dwukrotnie, aby upuścić.F",
    dragStartedVirtual:
      "Rozpoczęto przeciąganie. Wybierz miejsce, w którym chcesz upuścić element, a następnie kliknij lub naciśnij Enter, aby upuścić.",
    endDragKeyboard: "Przeciąganie. Naciśnij Enter, aby anulować przeciągnięcie.",
    endDragTouch: "Przeciąganie. Kliknij dwukrotnie, aby anulować przeciągnięcie.",
    endDragVirtual: "Przeciąganie. Kliknij, aby anulować przeciąganie.",
    dropDescriptionKeyboard:
      "Naciśnij Enter, aby upuścić. Naciśnij Escape, aby anulować przeciągnięcie.",
    dropDescriptionTouch: "Dotknij dwukrotnie, aby upuścić.",
    dropDescriptionVirtual: "Kliknij, aby upuścić.",
    dropCanceled: "Anulowano upuszczenie.",
    dropComplete: "Zakończono upuszczanie.",
    dropIndicator: "wskaźnik upuszczenia",
    dropOnRoot: "Upuść",
    dropOnItem: (v) => `Upuść na ${text(v?.itemText)}`,
    insertBefore: (v) => `Umieść przed ${text(v?.itemText)}`,
    insertBetween: (v) => `Umieść między ${text(v?.beforeItemText)} i ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Umieść za ${text(v?.itemText)}`,
  },
  "pt-BR": {
    dragItem: (v) => `Arrastar ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} item selecionado`, other: () => `${f.number(Number(v?.count))} itens selecionados` })}`,
    dragDescriptionKeyboard: "Pressione Enter para começar a arrastar.",
    dragDescriptionKeyboardAlt: "Pressione Alt + Enter para começar a arrastar.",
    dragDescriptionTouch: "Toque duas vezes para começar a arrastar.",
    dragDescriptionVirtual: "Clique para começar a arrastar.",
    dragDescriptionLongPress: "Pressione e segure para começar a arrastar.",
    dragSelectedKeyboard: (v, f) =>
      `Pressione Enter para arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} o item selecionado`, other: () => `${f.number(Number(v?.count))} os itens selecionados` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Pressione Alt + Enter para arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} o item selecionado`, other: () => `${f.number(Number(v?.count))} os itens selecionados` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Pressione e segure para arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} o item selecionado`, other: () => `${f.number(Number(v?.count))} os itens selecionados` })}.`,
    dragStartedKeyboard:
      "Comece a arrastar. Pressione Tab para navegar até um alvo e, em seguida, pressione Enter para soltar ou pressione Escape para cancelar.",
    dragStartedTouch: "Comece a arrastar. Navegue até um alvo e toque duas vezes para soltar.",
    dragStartedVirtual:
      "Comece a arrastar. Navegue até um alvo e clique ou pressione Enter para soltar.",
    endDragKeyboard: "Arrastando. Pressione Enter para cancelar.",
    endDragTouch: "Arrastando. Toque duas vezes para cancelar.",
    endDragVirtual: "Arrastando. Clique para cancelar.",
    dropDescriptionKeyboard: "Pressione Enter para soltar. Pressione Escape para cancelar.",
    dropDescriptionTouch: "Toque duas vezes para soltar.",
    dropDescriptionVirtual: "Clique para soltar.",
    dropCanceled: "Liberação cancelada.",
    dropComplete: "Liberação concluída.",
    dropIndicator: "indicador de liberação",
    dropOnRoot: "Soltar",
    dropOnItem: (v) => `Soltar em ${text(v?.itemText)}`,
    insertBefore: (v) => `Inserir antes de ${text(v?.itemText)}`,
    insertBetween: (v) => `Inserir entre ${text(v?.beforeItemText)} e ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Inserir após ${text(v?.itemText)}`,
  },
  "pt-PT": {
    dragItem: (v) => `Arrastar ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} item selecionado`, other: () => `${f.number(Number(v?.count))} itens selecionados` })}`,
    dragDescriptionKeyboard: "Prima Enter para iniciar o arrasto.",
    dragDescriptionKeyboardAlt: "Prima Alt + Enter para iniciar o arrasto.",
    dragDescriptionTouch: "Faça duplo toque para começar a arrastar.",
    dragDescriptionVirtual: "Clique para iniciar o arrasto.",
    dragDescriptionLongPress: "Prima longamente para começar a arrastar.",
    dragSelectedKeyboard: (v, f) =>
      `Prima Enter para arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} o item selecionado`, other: () => `${f.number(Number(v?.count))} os itens selecionados` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Prima Alt + Enter para arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} o item selecionado`, other: () => `${f.number(Number(v?.count))} os itens selecionados` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Prima longamente para arrastar ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} o item selecionado`, other: () => `${f.number(Number(v?.count))} os itens selecionados` })}.`,
    dragStartedKeyboard:
      "Arrasto iniciado. Prima a tecla de tabulação para navegar para um destino para largar, e em seguida prima Enter para largar ou prima Escape para cancelar.",
    dragStartedTouch:
      "Arrasto iniciado. Navegue para um destino para largar, e em seguida faça duplo toque para largar.",
    dragStartedVirtual:
      "Arrasto iniciado. Navegue para um destino para largar, e em seguida clique ou prima Enter para largar.",
    endDragKeyboard: "A arrastar. Prima Enter para cancelar o arrasto.",
    endDragTouch: "A arrastar. Faça duplo toque para cancelar o arrasto.",
    endDragVirtual: "A arrastar. Clique para cancelar o arrasto.",
    dropDescriptionKeyboard: "Prima Enter para largar. Prima Escape para cancelar o arrasto.",
    dropDescriptionTouch: "Faça duplo toque para largar.",
    dropDescriptionVirtual: "Clique para largar.",
    dropCanceled: "Largar cancelado.",
    dropComplete: "Largar completo.",
    dropIndicator: "Indicador de largar",
    dropOnRoot: "Largar em",
    dropOnItem: (v) => `Largar em ${text(v?.itemText)}`,
    insertBefore: (v) => `Inserir antes de ${text(v?.itemText)}`,
    insertBetween: (v) => `Inserir entre ${text(v?.beforeItemText)} e ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Inserir depois de ${text(v?.itemText)}`,
  },
  "ro-RO": {
    dragItem: (v) => `Glisați ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Glisați ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} element selectat`, other: () => `${f.number(Number(v?.count))} elemente selectate` })}`,
    dragDescriptionKeyboard: "Apăsați pe Enter pentru a începe glisarea.",
    dragDescriptionKeyboardAlt: "Apăsați pe Alt + Enter pentru a începe glisarea.",
    dragDescriptionTouch: "Atingeți de două ori pentru a începe să glisați.",
    dragDescriptionVirtual: "Faceți clic pentru a începe glisarea.",
    dragDescriptionLongPress: "Apăsați lung pentru a începe glisarea.",
    dragSelectedKeyboard: (v, f) =>
      `Apăsați pe Enter pentru a glisa ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} element selectat`, other: () => `${f.number(Number(v?.count))} elemente selectate` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Apăsați pe Alt + Enter pentru a glisa ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} element selectat`, other: () => `${f.number(Number(v?.count))} elemente selectate` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Apăsați lung pentru a glisa ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} element selectat`, other: () => `${f.number(Number(v?.count))} elemente selectate` })}.`,
    dragStartedKeyboard:
      "A început glisarea. Apăsați pe Tab pentru a naviga la o țintă de fixare, apoi apăsați pe Enter pentru a fixa sau apăsați pe Escape pentru a anula glisarea.",
    dragStartedTouch:
      "A început glisarea. Navigați la o țintă de fixare, apoi atingeți de două ori pentru a fixa.",
    dragStartedVirtual:
      "A început glisarea. Navigați la o țintă de fixare, apoi faceți clic sau apăsați pe Enter pentru a fixa.",
    endDragKeyboard: "Se glisează. Apăsați pe Enter pentru a anula glisarea.",
    endDragTouch: "Se glisează. Atingeți de două ori pentru a anula glisarea.",
    endDragVirtual: "Se glisează. Faceți clic pentru a anula glisarea.",
    dropDescriptionKeyboard:
      "Apăsați pe Enter pentru a fixa. Apăsați pe Escape pentru a anula glisarea.",
    dropDescriptionTouch: "Atingeți de două ori pentru a fixa.",
    dropDescriptionVirtual: "Faceți clic pentru a fixa.",
    dropCanceled: "Fixare anulată.",
    dropComplete: "Fixare finalizată.",
    dropIndicator: "indicator de fixare",
    dropOnRoot: "Fixare pe",
    dropOnItem: (v) => `Fixați pe ${text(v?.itemText)}`,
    insertBefore: (v) => `Inserați înainte de ${text(v?.itemText)}`,
    insertBetween: (v) => `Inserați între ${text(v?.beforeItemText)} și ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Inserați după ${text(v?.itemText)}`,
  },
  "ru-RU": {
    dragItem: (v) => `Перетащить ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Перетащить ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} выбранный элемент`, other: () => `${f.number(Number(v?.count))} выбранных элем` })}`,
    dragDescriptionKeyboard: "Нажмите клавишу Enter для начала перетаскивания.",
    dragDescriptionKeyboardAlt: "Нажмите Alt + Enter, чтобы начать перетаскивать.",
    dragDescriptionTouch: "Дважды нажмите для начала перетаскивания.",
    dragDescriptionVirtual: "Щелкните для начала перетаскивания.",
    dragDescriptionLongPress: "Нажмите и удерживайте, чтобы начать перетаскивать.",
    dragSelectedKeyboard: (v, f) =>
      `Нажмите Enter для перетаскивания ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} выбранного элемента`, other: () => `${f.number(Number(v?.count))} выбранных элементов` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Нажмите Alt + Enter для перетаскивания ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} выбранного элемента`, other: () => `${f.number(Number(v?.count))} выбранных элементов` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Нажмите и удерживайте для перетаскивания ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} выбранного элемента`, other: () => `${f.number(Number(v?.count))} выбранных элементов` })}.`,
    dragStartedKeyboard:
      "Начато перетаскивание. Нажмите клавишу Tab для выбора цели, затем нажмите клавишу Enter, чтобы применить перетаскивание, или клавишу Escape для отмены действия.",
    dragStartedTouch:
      "Начато перетаскивание. Выберите цель, затем дважды нажмите, чтобы применить перетаскивание.",
    dragStartedVirtual:
      "Начато перетаскивание. Нажмите клавишу Tab для выбора цели, затем нажмите клавишу Enter, чтобы применить перетаскивание.",
    endDragKeyboard: "Перетаскивание. Нажмите клавишу Enter для отмены.",
    endDragTouch: "Перетаскивание. Дважды нажмите для отмены.",
    endDragVirtual: "Перетаскивание. Щелкните для отмены.",
    dropDescriptionKeyboard:
      "Нажмите клавишу Enter, чтобы применить перетаскивание. Нажмите клавишу Escape для отмены.",
    dropDescriptionTouch: "Дважды нажмите, чтобы применить перетаскивание.",
    dropDescriptionVirtual: "Щелкните, чтобы применить перетаскивание.",
    dropCanceled: "Перетаскивание отменено.",
    dropComplete: "Перетаскивание завершено.",
    dropIndicator: "индикатор перетаскивания",
    dropOnRoot: "Перетащить на",
    dropOnItem: (v) => `Перетащить на ${text(v?.itemText)}`,
    insertBefore: (v) => `Вставить перед ${text(v?.itemText)}`,
    insertBetween: (v) => `Вставить между ${text(v?.beforeItemText)} и ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Вставить после ${text(v?.itemText)}`,
  },
  "sk-SK": {
    dragItem: (v) => `Presunúť položku ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Presunúť ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybratú položku`, other: () => `${f.number(Number(v?.count))} vybraté položky` })}`,
    dragDescriptionKeyboard: "Stlačením klávesu Enter začnete presúvanie.",
    dragDescriptionKeyboardAlt: "Stlačením klávesov Alt + Enter začnete presúvanie.",
    dragDescriptionTouch: "Dvojitým kliknutím začnete presúvanie.",
    dragDescriptionVirtual: "Kliknutím začnete presúvanie.",
    dragDescriptionLongPress: "Dlhým stlačením začnete presúvanie.",
    dragSelectedKeyboard: (v, f) =>
      `Stlačením klávesu Enter presuniete ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybratú položku`, other: () => `${f.number(Number(v?.count))} vybratých položiek` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Stlačením klávesov Alt + Enter presuniete ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybratú položku`, other: () => `${f.number(Number(v?.count))} vybratých položiek` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Dlhým stlačením presuniete ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} vybratú položku`, other: () => `${f.number(Number(v?.count))} vybratých položiek` })}.`,
    dragStartedKeyboard:
      "Presúvanie sa začalo. Do cieľového umiestnenia prejdete stlačením klávesu Tab. Ak chcete položku umiestniť, stlačte kláves Enter alebo stlačte kláves Esc, ak chcete presúvanie zrušiť.",
    dragStartedTouch:
      "Presúvanie sa začalo. Prejdite na cieľové umiestnenie a dvojitým kliknutím umiestnite položku.",
    dragStartedVirtual:
      "Presúvanie sa začalo. Prejdite na cieľové umiestnenie a kliknutím alebo stlačením klávesu Enter umiestnite položku.",
    endDragKeyboard: "Prebieha presúvanie. Ak ho chcete zrušiť, stlačte kláves Enter.",
    endDragTouch: "Prebieha presúvanie. Dvojitým kliknutím ho môžete zrušiť.",
    endDragVirtual: "Prebieha presúvanie.",
    dropDescriptionKeyboard:
      "Stlačením klávesu Enter umiestnite položku. Stlačením klávesu Esc zrušíte presúvanie.",
    dropDescriptionTouch: "Dvojitým kliknutím umiestnite položku.",
    dropDescriptionVirtual: "Kliknutím umiestnite položku.",
    dropCanceled: "Umiestnenie zrušené.",
    dropComplete: "Umiestnenie dokončené.",
    dropIndicator: "indikátor umiestnenia",
    dropOnRoot: "Umiestniť na",
    dropOnItem: (v) => `Umiestniť na položku ${text(v?.itemText)}`,
    insertBefore: (v) => `Vložiť pred položku ${text(v?.itemText)}`,
    insertBetween: (v) =>
      `Vložiť medzi položky ${text(v?.beforeItemText)} a ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Vložiť za položku ${text(v?.itemText)}`,
  },
  "sl-SI": {
    dragItem: (v) => `Povleci ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Povlecite ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izbran element`, other: () => `izbrane elemente (${f.number(Number(v?.count))})` })}`,
    dragDescriptionKeyboard: "Pritisnite tipko Enter za začetek vlečenja.",
    dragDescriptionKeyboardAlt: "Pritisnite tipki Alt + Enter za začetek vlečenja.",
    dragDescriptionTouch: "Dvotapnite za začetek vlečenja.",
    dragDescriptionVirtual: "Kliknite za začetek vlečenja.",
    dragDescriptionLongPress: "Pritisnite in zadržite za začetek vlečenja.",
    dragSelectedKeyboard: (v, f) =>
      `Pritisnite tipko Enter, da povlečete ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izbrani element`, other: () => `${f.number(Number(v?.count))} izbranih elementov` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Pritisnite tipki Alt + Enter, da povlečete ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izbrani element`, other: () => `${f.number(Number(v?.count))} izbranih elementov` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Pritisnite in zadržite, da povlečete ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izbrani element`, other: () => `${f.number(Number(v?.count))} izbranih elementov` })}.`,
    dragStartedKeyboard:
      "Vlečenje se je začelo. Pritisnite tipko Tab za pomik na mesto, kamor želite spustiti elemente, in pritisnite tipko Enter, da jih spustite, ali tipko Escape, da prekličete postopek.",
    dragStartedTouch:
      "Vlečenje se je začelo. Pomaknite se na mesto, kamor želite spustiti elemente, in dvotapnite, da jih spustite.",
    dragStartedVirtual:
      "Vlečenje se je začelo. Pomaknite se na mesto, kamor želite spustiti elemente, in kliknite ali pritisnite tipko Enter, da jih spustite.",
    endDragKeyboard: "Vlečenje. Pritisnite tipko Enter za preklic vlečenja.",
    endDragTouch: "Vlečenje. Dvotapnite za preklic vlečenja.",
    endDragVirtual: "Vlečenje. Kliknite, da prekličete vlečenje.",
    dropDescriptionKeyboard:
      "Pritisnite tipko Enter, da spustite. Pritisnite tipko Escape, da prekličete vlečenje.",
    dropDescriptionTouch: "Dvotapnite, da spustite.",
    dropDescriptionVirtual: "Kliknite, da spustite.",
    dropCanceled: "Spust je preklican.",
    dropComplete: "Spust je končan.",
    dropIndicator: "indikator spusta",
    dropOnRoot: "Spusti na mesto",
    dropOnItem: (v) => `Spusti na mesto ${text(v?.itemText)}`,
    insertBefore: (v) => `Vstavi pred ${text(v?.itemText)}`,
    insertBetween: (v) => `Vstavi med ${text(v?.beforeItemText)} in ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Vstavi za ${text(v?.itemText)}`,
  },
  "sr-SP": {
    dragItem: (v) => `Prevucite ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Prevucite ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izabranu stavku`, other: () => `${f.number(Number(v?.count))} izabrane stavke` })}`,
    dragDescriptionKeyboard: "Pritisnite Enter da biste započeli prevlačenje.",
    dragDescriptionKeyboardAlt: "Pritisnite Alt + Enter da biste započeli prevlačenje.",
    dragDescriptionTouch: "Dvaput dodirnite da biste započeli prevlačenje.",
    dragDescriptionVirtual: "Kliknite da biste započeli prevlačenje.",
    dragDescriptionLongPress: "Pritisnite dugo da biste započeli prevlačenje.",
    dragSelectedKeyboard: (v, f) =>
      `Pritisnite Enter da biste prevukli ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izabranu stavku`, other: () => `${f.number(Number(v?.count))} izabranih stavki` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Pritisnite Alt + Enter da biste prevukli ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izabranu stavku`, other: () => `${f.number(Number(v?.count))} izabranih stavki` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Pritisnite dugo da biste prevukli ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} izabranu stavku`, other: () => `${f.number(Number(v?.count))} izabranih stavki` })}.`,
    dragStartedKeyboard:
      "Prevlačenje je započeto. Pritisnite Tab da biste otišli do cilja za otpuštanje, zatim pritisnite Enter za ispuštanje ili pritisnite Escape za otkazivanje.",
    dragStartedTouch:
      "Prevlačenje je započeto. Idite do cilja za otpuštanje, a zatim dvaput dodirnite za otpuštanje.",
    dragStartedVirtual:
      "Prevlačenje je započeto. Idite do cilja za otpuštanje, a zatim kliknite ili pritinite Enter za otpuštanje.",
    endDragKeyboard: "Prevlačenje u toku. Pritisnite Enter da biste otkazali prevlačenje.",
    endDragTouch: "Prevlačenje u toku. Dvaput dodirnite da biste otkazali prevlačenje.",
    endDragVirtual: "Prevlačenje u toku. Kliknite da biste otkazali prevlačenje.",
    dropDescriptionKeyboard:
      "Pritisnite Enter da biste otpustili. Pritisnite Escape da biste otkazali prevlačenje.",
    dropDescriptionTouch: "Dvaput dodirnite za otpuštanje.",
    dropDescriptionVirtual: "Kliknite za otpuštanje.",
    dropCanceled: "Otpuštanje je otkazano.",
    dropComplete: "Prevlačenje je završeno.",
    dropIndicator: "Indikator otpuštanja",
    dropOnRoot: "Otpusti na",
    dropOnItem: (v) => `Otpusti na ${text(v?.itemText)}`,
    insertBefore: (v) => `Umetnite ispred ${text(v?.itemText)}`,
    insertBetween: (v) => `Umetnite između ${text(v?.beforeItemText)} i ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Umetnite posle ${text(v?.itemText)}`,
  },
  "sv-SE": {
    dragItem: (v) => `Dra ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} valt objekt`, other: () => `${f.number(Number(v?.count))} valda objekt` })}`,
    dragDescriptionKeyboard: "Tryck på enter för att börja dra.",
    dragDescriptionKeyboardAlt: "Tryck på Alt + Retur för att börja dra.",
    dragDescriptionTouch: "Dubbeltryck för att börja dra.",
    dragDescriptionVirtual: "Klicka för att börja dra.",
    dragDescriptionLongPress: "Tryck länge för att börja dra.",
    dragSelectedKeyboard: (v, f) =>
      `Tryck på Retur för att dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} markerat objekt`, other: () => `${f.number(Number(v?.count))} markerade objekt` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Tryck på Alt + Retur för att dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} markerat objekt`, other: () => `${f.number(Number(v?.count))} markerade objekt` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Tryck länge för att dra ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} markerat objekt`, other: () => `${f.number(Number(v?.count))} markerade objekt` })}.`,
    dragStartedKeyboard:
      "Börja dra. Tryck på tabb för att navigera till målet, tryck på enter för att släppa eller på escape för att avbryta.",
    dragStartedTouch: "Börja dra. Navigera till ett mål och dubbeltryck för att släppa.",
    dragStartedVirtual:
      "Börja dra. Navigera till ett mål och klicka eller tryck på enter för att släppa.",
    endDragKeyboard: "Drar. Tryck på enter för att avbryta dragåtgärd.",
    endDragTouch: "Drar. Dubbeltryck för att avbryta dragåtgärd.",
    endDragVirtual: "Drar. Klicka för att avbryta dragåtgärd.",
    dropDescriptionKeyboard:
      "Tryck på enter för att släppa. Tryck på escape för att avbryta dragåtgärd.",
    dropDescriptionTouch: "Dubbeltryck för att släppa.",
    dropDescriptionVirtual: "Klicka för att släppa.",
    dropCanceled: "Släppåtgärd avbröts.",
    dropComplete: "Släppåtgärd klar.",
    dropIndicator: "släppindikator",
    dropOnRoot: "Släpp på",
    dropOnItem: (v) => `Släpp på ${text(v?.itemText)}`,
    insertBefore: (v) => `Infoga före ${text(v?.itemText)}`,
    insertBetween: (v) => `Infoga mellan ${text(v?.beforeItemText)} och ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Infoga efter ${text(v?.itemText)}`,
  },
  "tr-TR": {
    dragItem: (v) => `${text(v?.itemText)}’i sürükle`,
    dragSelectedItems: (v, f) =>
      `Sürükle ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} seçili öge`, other: () => `${f.number(Number(v?.count))} seçili öge` })}`,
    dragDescriptionKeyboard: "Sürüklemeyi başlatmak için Enter'a basın.",
    dragDescriptionKeyboardAlt: "Sürüklemeyi başlatmak için Alt + Enter'a basın.",
    dragDescriptionTouch: "Sürüklemeyi başlatmak için çift tıklayın.",
    dragDescriptionVirtual: "Sürüklemeyi başlatmak için tıklayın.",
    dragDescriptionLongPress: "Sürüklemeye başlamak için uzun basın.",
    dragSelectedKeyboard: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} seçilmiş öğe`, other: () => `${f.number(Number(v?.count))} seçilmiş öğe` })} öğesini sürüklemek için Enter'a basın.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} seçilmiş öğe`, other: () => `${f.number(Number(v?.count))} seçilmiş öğe` })} öğesini sürüklemek için Alt + Enter tuşuna basın.`,
    dragSelectedLongPress: (v, f) =>
      `${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} seçilmiş öğe`, other: () => `${f.number(Number(v?.count))} seçilmiş öğe` })} öğesini sürüklemek için uzun basın.`,
    dragStartedKeyboard:
      "Sürükleme başlatıldı. Bir bırakma hedefine gitmek için Tab’a basın, ardından bırakmak için Enter’a basın veya iptal etmek için Escape’e basın.",
    dragStartedTouch:
      "Sürükleme başlatıldı. Bir bırakma hedefine gidin, ardından bırakmak için çift tıklayın.",
    dragStartedVirtual:
      "Sürükleme başlatıldı. Bir bırakma hedefine gidin, ardından bırakmak için Enter’a tıklayın veya basın.",
    endDragKeyboard: "Sürükleme. Sürüklemeyi iptal etmek için Enter'a basın.",
    endDragTouch: "Sürükleme. Sürüklemeyi iptal etmek için çift tıklayın.",
    endDragVirtual: "Sürükleme. Sürüklemeyi iptal etmek için tıklayın.",
    dropDescriptionKeyboard:
      "Bırakmak için Enter'a basın. Sürüklemeyi iptal etmek için Escape'e basın.",
    dropDescriptionTouch: "Bırakmak için çift tıklayın.",
    dropDescriptionVirtual: "Bırakmak için tıklayın.",
    dropCanceled: "Bırakma iptal edildi.",
    dropComplete: "Bırakma tamamlandı.",
    dropIndicator: "bırakma göstergesi",
    dropOnRoot: "Bırakın",
    dropOnItem: (v) => `${text(v?.itemText)} üzerine bırak`,
    insertBefore: (v) => `${text(v?.itemText)}’den önce gir`,
    insertBetween: (v) => `${text(v?.beforeItemText)} ve ${text(v?.afterItemText)} arasına gir`,
    insertAfter: (v) => `${text(v?.itemText)}’den sonra gir`,
  },
  "uk-UA": {
    dragItem: (v) => `Перетягнути ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `Перетягніть ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} вибраний елемент`, other: () => `${f.number(Number(v?.count))} вибраних елем` })}`,
    dragDescriptionKeyboard: "Натисніть Enter, щоб почати перетягування.",
    dragDescriptionKeyboardAlt: "Натисніть Alt + Enter, щоб почати перетягування.",
    dragDescriptionTouch: "Натисніть двічі, щоб почати перетягування.",
    dragDescriptionVirtual: "Натисніть, щоб почати перетягування.",
    dragDescriptionLongPress: "Натисніть і утримуйте, щоб почати перетягування.",
    dragSelectedKeyboard: (v, f) =>
      `Натисніть Enter, щоб перетягнути ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} вибраний елемент`, other: () => `${f.number(Number(v?.count))} вибраних елементи(-ів)` })}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Натисніть Alt + Enter, щоб перетягнути ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} вибраний елемент`, other: () => `${f.number(Number(v?.count))} вибраних елементи(-ів)` })}.`,
    dragSelectedLongPress: (v, f) =>
      `Утримуйте, щоб перетягнути ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} вибраний елемент`, other: () => `${f.number(Number(v?.count))} вибраних елементи(-ів)` })}.`,
    dragStartedKeyboard:
      "Перетягування почалося. Натисніть Tab, щоб перейти до цілі перетягування, потім натисніть Enter, щоб перетягнути, або Escape, щоб скасувати.",
    dragStartedTouch:
      "Перетягування почалося. Перейдіть до цілі перетягування, потім натисніть двічі, щоб перетягнути.",
    dragStartedVirtual:
      "Перетягування почалося. Перейдіть до цілі перетягування, потім натисніть Enter, щоб перетягнути.",
    endDragKeyboard: "Триває перетягування. Натисніть Enter, щоб скасувати перетягування.",
    endDragTouch: "Триває перетягування. Натисніть двічі, щоб скасувати перетягування.",
    endDragVirtual: "Триває перетягування. Натисніть, щоб скасувати перетягування.",
    dropDescriptionKeyboard:
      "Натисніть Enter, щоб перетягнути. Натисніть Escape, щоб скасувати перетягування.",
    dropDescriptionTouch: "Натисніть двічі, щоб перетягнути.",
    dropDescriptionVirtual: "Натисніть, щоб перетягнути.",
    dropCanceled: "Перетягування скасовано.",
    dropComplete: "Перетягування завершено.",
    dropIndicator: "індикатор перетягування",
    dropOnRoot: "Перетягнути на",
    dropOnItem: (v) => `Перетягнути на ${text(v?.itemText)}`,
    insertBefore: (v) => `Вставити перед ${text(v?.itemText)}`,
    insertBetween: (v) => `Вставити між ${text(v?.beforeItemText)} і ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Вставити після ${text(v?.itemText)}`,
  },
  "zh-CN": {
    dragItem: (v) => `拖动 ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) =>
      `拖动 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 选中项目`, other: () => `${f.number(Number(v?.count))} 选中项目` })}`,
    dragDescriptionKeyboard: "按 Enter 开始拖动。",
    dragDescriptionKeyboardAlt: "按 Alt + Enter 开始拖动。",
    dragDescriptionTouch: "双击开始拖动。",
    dragDescriptionVirtual: "单击开始拖动。",
    dragDescriptionLongPress: "长按以开始拖动。",
    dragSelectedKeyboard: (v, f) =>
      `按 Enter 以拖动 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 个选定项`, other: () => `${f.number(Number(v?.count))} 个选定项` })}。`,
    dragSelectedKeyboardAlt: (v, f) =>
      `按 Alt + Enter 以拖动 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 个选定项`, other: () => `${f.number(Number(v?.count))} 个选定项` })}。`,
    dragSelectedLongPress: (v, f) =>
      `长按以拖动 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 个选定项`, other: () => `${f.number(Number(v?.count))} 个选定项` })}。`,
    dragStartedKeyboard: "已开始拖动。按 Tab 导航到放置目标，然后按 Enter 放置或按 Escape 取消。",
    dragStartedTouch: "已开始拖动。导航到放置目标，然后双击放置。",
    dragStartedVirtual: "已开始拖动。导航到放置目标，然后单击或按 Enter 放置。",
    endDragKeyboard: "正在拖动。按 Enter 取消拖动。",
    endDragTouch: "正在拖动。双击取消拖动。",
    endDragVirtual: "正在拖动。单击取消拖动。",
    dropDescriptionKeyboard: "按 Enter 放置。按 Escape 取消拖动。",
    dropDescriptionTouch: "双击放置。",
    dropDescriptionVirtual: "单击放置。",
    dropCanceled: "放置已取消。",
    dropComplete: "放置已完成。",
    dropIndicator: "放置标记",
    dropOnRoot: "放置于",
    dropOnItem: (v) => `放置于 ${text(v?.itemText)}`,
    insertBefore: (v) => `插入到 ${text(v?.itemText)} 之前`,
    insertBetween: (v) => `插入到 ${text(v?.beforeItemText)} 和 ${text(v?.afterItemText)} 之间`,
    insertAfter: (v) => `插入到 ${text(v?.itemText)} 之后`,
  },
  "zh-TW": {
    dragItem: (v) => `拖曳「${text(v?.itemText)}」`,
    dragSelectedItems: (v, f) =>
      `拖曳 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 個選定項目`, other: () => `${f.number(Number(v?.count))} 個選定項目` })}`,
    dragDescriptionKeyboard: "按 Enter 鍵以開始拖曳。",
    dragDescriptionKeyboardAlt: "按 Alt+Enter 鍵以開始拖曳。",
    dragDescriptionTouch: "輕點兩下以開始拖曳。",
    dragDescriptionVirtual: "按一下滑鼠以開始拖曳。",
    dragDescriptionLongPress: "長按以開始拖曳。",
    dragSelectedKeyboard: (v, f) =>
      `按 Enter 鍵以拖曳 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 個選定項目`, other: () => `${f.number(Number(v?.count))} 個選定項目` })}。`,
    dragSelectedKeyboardAlt: (v, f) =>
      `按 Alt+Enter 鍵以拖曳 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 個選定項目`, other: () => `${f.number(Number(v?.count))} 個選定項目` })}。`,
    dragSelectedLongPress: (v, f) =>
      `長按以拖曳 ${f.plural(Number(v?.count), { one: () => `${f.number(Number(v?.count))} 個選定項目`, other: () => `${f.number(Number(v?.count))} 個選定項目` })}。`,
    dragStartedKeyboard:
      "已開始拖曳。按 Tab 鍵以瀏覽至放置目標，然後按 Enter 鍵以放置，或按 Escape 鍵以取消。",
    dragStartedTouch: "已開始拖曳。瀏覽至放置目標，然後輕點兩下以放置。",
    dragStartedVirtual: "已開始拖曳。瀏覽至放置目標，然後按一下滑鼠或按 Enter 鍵以放置。",
    endDragKeyboard: "拖曳中。按 Enter 鍵以取消拖曳。",
    endDragTouch: "拖曳中。輕點兩下以取消拖曳。",
    endDragVirtual: "拖曳中。按一下滑鼠以取消拖曳。",
    dropDescriptionKeyboard: "按 Enter 鍵以放置。按 Escape 鍵以取消拖曳。",
    dropDescriptionTouch: "輕點兩下以放置。",
    dropDescriptionVirtual: "按一下滑鼠以放置。",
    dropCanceled: "放置已取消。",
    dropComplete: "放置已完成。",
    dropIndicator: "放置指示器",
    dropOnRoot: "放置在",
    dropOnItem: (v) => `放置在「${text(v?.itemText)}」上`,
    insertBefore: (v) => `插入至「${text(v?.itemText)}」之前`,
    insertBetween: (v) => `插入至「${text(v?.beforeItemText)}」和「${text(v?.afterItemText)}」之間`,
    insertAfter: (v) => `插入至「${text(v?.itemText)}」之後`,
  },
});
