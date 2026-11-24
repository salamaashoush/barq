import type { JSX } from "@barqjs/web";
import { type LexicalCommand, createCommand } from "lexical";

export interface ElementRef {
  current: HTMLElement | null;
}

/**
 * One item of a typeahead or node menu. Subclass it to carry your own data;
 * `key` must be unique among the options shown together.
 */
export class MenuOption {
  key: string;
  /** The option's rendered element, for scrolling it into view. */
  ref: ElementRef;
  /** Drawn before the title by the default menu. A function builds it where it is shown. */
  icon?: JSX.Element | (() => JSX.Element);
  title?: JSX.Element | string;

  constructor(key: string) {
    this.key = key;
    this.ref = { current: null };
    this.setRefElement = this.setRefElement.bind(this);
  }

  setRefElement(element: HTMLElement | null): void {
    this.ref = { current: element };
  }
}

export interface TypeaheadScrollTarget {
  index: number;
  option: MenuOption;
}

/**
 * Dispatched while a menu is open to bring the highlighted option into view.
 * The menu handles it; register at a higher priority to scroll differently.
 */
export const SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND: LexicalCommand<TypeaheadScrollTarget> =
  createCommand("SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND");
