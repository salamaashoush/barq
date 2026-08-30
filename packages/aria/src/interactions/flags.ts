/**
 * Two module-level flags that three otherwise independent modules read.
 *
 * They live here rather than beside the code that sets them because the
 * alternative is an import cycle: the modality tracker must ignore the focus
 * events `preventFocus` fabricates, and `preventFocus` is part of press, which
 * asks the modality tracker what the pointer type is.
 */

let ignoringFocus = false;
let openingLink = false;

/** Whether a focus event now is one `preventFocus` is undoing, not a real one. */
export function isIgnoringFocus(): boolean {
  return ignoringFocus;
}

export function setIgnoringFocus(value: boolean): void {
  ignoringFocus = value;
}

/**
 * Whether a link is being opened right now.
 *
 * The synthetic click that opens a link must not be read as a virtual click,
 * which is what would otherwise switch the page into virtual modality and make
 * every focus ring appear.
 */
export function isOpeningLink(): boolean {
  return openingLink;
}

export function setOpeningLink(value: boolean): void {
  openingLink = value;
}
