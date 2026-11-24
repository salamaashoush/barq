import { createContext, getOwner, install, useContext } from "@barqjs/core";

/**
 * Every word arc's own components put on the page.
 *
 * A component's own prop (`<CopyButton copiedLabel="…">`) still wins for that
 * one instance; these are what it says when nobody passed one, so an app in
 * another language translates arc once, at its `<ArcProvider messages>`.
 */
export interface ArcMessages {
  copy: string;
  copied: string;
  copyFailed: string;
  copyCode: string;
  original: string;
  modified: string;
  breadcrumb: string;
  showFullPath: string;
  mainNavigation: string;
  skipToContent: string;
  commandMenu: string;
  commandMenuDescription: string;
  commandPlaceholder: string;
  noResults: string;
  continue: string;
  cancel: string;
  save: string;
  close: string;
  selectAll: string;
  selectRow: string;
  loadingMore: string;
  previousPage: string;
  nextPage: string;
  page: (page: number, pages: number) => string;
  pagination: string;
  resizeColumn: string;
  nothingHere: string;
  filters: string;
  clearFilters: string;
  view: string;
  columns: string;
  selected: (count: number) => string;
  clearSelection: string;
  selection: string;
  discardHeading: string;
  discardDescription: string;
  discard: string;
  keepEditing: string;
  theme: string;
  light: string;
  dark: string;
  system: string;
  showPassword: string;
  hidePassword: string;
  selectPlaceholder: string;
  noMatches: string;
  searchTimeZones: string;
  trend: (count: string, first: string, last: string, lowest: string, highest: string) => string;
  remove: string;
  showAll: (count: number) => string;
  showLess: string;
  clearAll: string;
}

export const ENGLISH: ArcMessages = {
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Could not copy",
  copyCode: "Copy code",
  original: "Original",
  modified: "Modified",
  breadcrumb: "Breadcrumb",
  showFullPath: "Show the full path",
  mainNavigation: "Main",
  skipToContent: "Skip to content",
  commandMenu: "Command menu",
  commandMenuDescription: "Search for a page or an action.",
  commandPlaceholder: "Type a command or search...",
  noResults: "No results found.",
  continue: "Continue",
  cancel: "Cancel",
  save: "Save",
  close: "Close",
  selectAll: "Select all",
  selectRow: "Select",
  loadingMore: "Loading more",
  previousPage: "Previous page",
  nextPage: "Next page",
  page: (page, pages) => `Page ${String(page)} of ${String(pages)}`,
  pagination: "Pages",
  resizeColumn: "Resize column",
  nothingHere: "Nothing here yet",
  filters: "Filters",
  clearFilters: "Clear filters",
  view: "View",
  columns: "Columns",
  selected: (count) => `${String(count)} selected`,
  clearSelection: "Clear selection",
  selection: "Selection",
  discardHeading: "Discard unsaved changes?",
  discardDescription: "What you changed here has not been saved.",
  discard: "Discard",
  keepEditing: "Keep editing",
  theme: "Theme",
  light: "Light",
  dark: "Dark",
  system: "System",
  showPassword: "Show password",
  hidePassword: "Hide password",
  selectPlaceholder: "Select",
  noMatches: "No matches",
  searchTimeZones: "Search time zones",
  trend: (count, first, last, lowest, highest) =>
    `Trend over ${count} values, from ${first} to ${last}; lowest ${lowest}, highest ${highest}`,
  remove: "Remove",
  showAll: (count) => `Show all (${String(count)})`,
  showLess: "Show less",
  clearAll: "Clear all",
};

const MessagesContext = createContext<ArcMessages>(ENGLISH, "ArcMessages");

/**
 * arc's words below the calling component: English with `overrides` over it,
 * read again whenever the function reads something that changed, so a
 * language switch reaches every component without remounting one.
 */
export function provideArcMessages(overrides: () => Partial<ArcMessages> | undefined): void {
  const owner = getOwner();
  if (owner !== null) install(owner, MessagesContext, () => ({ ...ENGLISH, ...overrides() }));
}

/** arc's words where the caller renders: English unless a provider said otherwise. */
export function useArcMessages(): () => ArcMessages {
  return useContext(MessagesContext);
}
