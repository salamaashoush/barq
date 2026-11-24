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
  recent: string;
  searching: string;
  searchingIn: (heading: string) => string;
  noMatchesIn: (heading: string) => string;
  searchFailed: (heading: string) => string;
  showMoreIn: (heading: string) => string;
  resultCount: (count: number) => string;
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
  added: (value: string) => string;
  duplicateTag: (tag: string) => string;
  tooManyTags: (max: number) => string;
  chooseTime: string;
  pickDates: string;
  chooseDates: string;
  presets: string;
  today: string;
  lastDays: (days: number) => string;
  colourArea: string;
  colourSwatches: string;
  hex: string;
  pickFromScreen: string;
  pickColour: string;
  country: string;
  invalidPhone: string;
  minimum: string;
  maximum: string;
  stars: (count: number) => string;
  rated: (value: string, max: string) => string;
  dropZone: string;
  dropFiles: string;
  chooseFiles: string;
  acceptedTypes: (types: string) => string;
  maxFileSize: (size: string) => string;
  fileTypeNotAllowed: (name: string) => string;
  fileTooLarge: (name: string, size: string) => string;
  tooManyFiles: (max: number) => string;
  uploads: string;
  queued: string;
  uploading: string;
  uploadDone: string;
  cancelled: string;
  uploaded: (name: string) => string;
  uploadFailed: (name: string) => string;
  uploadingFile: (name: string) => string;
  retryUpload: (name: string) => string;
  cancelUpload: (name: string) => string;
  removeFile: (name: string) => string;
  moreOptions: string;
  moreActions: string;
  dismiss: string;
  stepOf: (step: string, total: string) => string;
  skipTour: string;
  back: string;
  next: string;
  done: string;
  opensInNewTab: string;
  showMore: string;
  moreTabs: string;
  scrollBackward: string;
  scrollForward: string;
  completed: string;
  hasErrors: string;
  optional: string;
  firstPage: string;
  lastPage: string;
  goToPage: (page: number) => string;
  pageRange: (from: string, to: string, total: string) => string;
  pageSize: string;
  onThisPage: string;
  loadMore: string;
  moreCount: (count: number) => string;
  newItem: string;
  newCount: (count: string) => string;
  online: string;
  away: string;
  busy: string;
  offline: string;
  imageUnavailable: string;
  imageViewer: string;
  previousImage: string;
  nextImage: string;
  imageOf: (index: string, total: string) => string;
  zoomIn: string;
  zoomOut: string;
  slideOf: (index: string, total: string) => string;
  chooseSlide: string;
  pause: string;
  play: string;
  showDataTable: string;
  hideDataTable: string;
  chartValue: string;
  chartCategory: string;
  chartStage: string;
  chartShare: string;
  chartLess: string;
  chartMore: string;
  shareOfFirst: (share: string) => string;
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
  recent: "Recent",
  searching: "Searching…",
  searchingIn: (heading) => `Searching ${heading}`,
  noMatchesIn: (heading) => `No matches in ${heading}`,
  searchFailed: (heading) => `${heading} could not be searched`,
  showMoreIn: (heading) => `Show more ${heading}`,
  resultCount: (count) => (count === 1 ? "1 result" : `${String(count)} results`),
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
  added: (value) => `Added ${value}`,
  duplicateTag: (tag) => `${tag} is already added`,
  tooManyTags: (max) => `No more than ${String(max)}`,
  chooseTime: "Choose a time",
  pickDates: "Pick dates",
  chooseDates: "Choose a range of dates",
  presets: "Presets",
  today: "Today",
  lastDays: (days) => `Last ${String(days)} days`,
  colourArea: "Colour",
  colourSwatches: "Colour swatches",
  hex: "Hex",
  pickFromScreen: "Pick a colour from the screen",
  pickColour: "Pick a colour",
  country: "Country",
  invalidPhone: "Enter a phone number with its area code",
  minimum: "Minimum",
  maximum: "Maximum",
  stars: (count) => (count === 1 ? "1 star" : `${String(count)} stars`),
  rated: (value, max) => `Rated ${value} out of ${max}`,
  dropZone: "Upload files",
  dropFiles: "Drop files here",
  chooseFiles: "Choose files",
  acceptedTypes: (types) => `Accepts ${types}`,
  maxFileSize: (size) => `Up to ${size} each`,
  fileTypeNotAllowed: (name) => `${name} is not a type this accepts`,
  fileTooLarge: (name, size) => `${name} is larger than ${size}`,
  tooManyFiles: (max) => `No more than ${String(max)} files at once`,
  uploads: "Uploads",
  queued: "Waiting",
  uploading: "Uploading",
  uploadDone: "Uploaded",
  cancelled: "Cancelled",
  uploaded: (name) => `${name} uploaded`,
  uploadFailed: (name) => `${name} could not be uploaded`,
  uploadingFile: (name) => `Uploading ${name}`,
  retryUpload: (name) => `Retry ${name}`,
  cancelUpload: (name) => `Cancel ${name}`,
  removeFile: (name) => `Remove ${name}`,
  moreOptions: "More options",
  moreActions: "More actions",
  dismiss: "Dismiss",
  stepOf: (step, total) => `${step} of ${total}`,
  skipTour: "Skip tour",
  back: "Back",
  next: "Next",
  done: "Done",
  opensInNewTab: "opens in a new tab",
  showMore: "Show more",
  moreTabs: "More",
  scrollBackward: "Scroll back",
  scrollForward: "Scroll forward",
  completed: "Completed",
  hasErrors: "Has errors",
  optional: "Optional",
  firstPage: "First page",
  lastPage: "Last page",
  goToPage: (page) => `Page ${String(page)}`,
  pageRange: (from, to, total) => `${from}–${to} of ${total}`,
  pageSize: "Rows per page",
  onThisPage: "On this page",
  loadMore: "Load more",
  moreCount: (count) => `${String(count)} more`,
  newItem: "New",
  newCount: (count) => `${count} new`,
  online: "Online",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
  imageUnavailable: "Image unavailable",
  imageViewer: "Image viewer",
  previousImage: "Previous image",
  nextImage: "Next image",
  imageOf: (index, total) => `Image ${index} of ${total}`,
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  slideOf: (index, total) => `Slide ${index} of ${total}`,
  chooseSlide: "Choose a slide",
  pause: "Pause",
  play: "Play",
  showDataTable: "Show data table",
  hideDataTable: "Hide data table",
  chartValue: "Value",
  chartCategory: "Category",
  chartStage: "Stage",
  chartShare: "Share",
  chartLess: "Less",
  chartMore: "More",
  shareOfFirst: (share) => `${share} of the first stage`,
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
