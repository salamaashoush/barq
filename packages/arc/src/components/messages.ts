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
  doNotDisturb: string;
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
  comments: string;
  comment: string;
  newComment: string;
  commentPlaceholder: string;
  reply: string;
  replyPlaceholder: string;
  editComment: string;
  edit: string;
  delete: string;
  edited: string;
  sending: string;
  sendFailed: string;
  editFailed: string;
  deleteFailed: string;
  retry: string;
  you: string;
  commentActions: (author: string) => string;
  deleteCommentHeading: string;
  deleteCommentDescription: string;
  reactions: string;
  addReaction: string;
  reactedWith: (emoji: string, count: number, who: string | undefined) => string;
  mentionSuggestions: string;
  threadBy: (author: string) => string;
  threadOn: (anchor: string) => string;
  showAnchor: (anchor: string) => string;
  detachedAnchor: string;
  resolve: string;
  reopen: string;
  resolved: string;
  openThreads: string;
  resolvedThreads: string;
  allThreads: string;
  noComments: string;
  mediaControls: string;
  seek: string;
  timeOf: (time: string, total: string) => string;
  mute: string;
  unmute: string;
  volume: string;
  chapters: string;
  chapterNow: (title: string) => string;
  playbackSpeed: string;
  normalSpeed: string;
  captions: string;
  captionsOff: string;
  transcript: string;
  pictureInPicture: string;
  exitPictureInPicture: string;
  fullscreen: string;
  exitFullscreen: string;
  recordAudio: string;
  recordVideo: string;
  microphone: string;
  camera: string;
  recorderIntro: (device: string) => string;
  turnOn: (device: string) => string;
  permissionDenied: (device: string) => string;
  permissionHelp: (device: string) => string;
  deviceMissing: (device: string) => string;
  recordingUnsupported: string;
  chooseDevice: (device: string) => string;
  cameraPreview: string;
  startRecording: string;
  stopRecording: string;
  recordingStarted: string;
  recordedFor: (duration: string) => string;
  recordingPreview: string;
  recordAgain: string;
  useRecording: string;
  attachFailed: string;
  versionHistory: string;
  versions: string;
  currentVersion: string;
  previousVersion: string;
  preview: string;
  compare: string;
  compareWith: string;
  restore: string;
  restoreHeading: (version: string) => string;
  restoreDescription: string;
  restoreFailed: string;
  noVersions: string;
  nothingToCompare: string;
  or: string;
  signIn: string;
  signUp: string;
  email: string;
  password: string;
  fullName: string;
  rememberMe: string;
  forgotPassword: string;
  emailInvalid: string;
  passwordRequired: string;
  nameRequired: string;
  passwordWeak: string;
  passwordsDiffer: string;
  confirmPassword: string;
  termsRequired: string;
  emailMeLink: string;
  usePassword: string;
  sendLink: string;
  linkFailed: string;
  checkInbox: string;
  linkSent: (email: string) => string;
  confirmSent: (email: string) => string;
  resetSent: (email: string) => string;
  signInWithPasskey: string;
  passkeyFailed: string;
  forgotPasswordHeading: string;
  forgotPasswordDescription: string;
  sendResetLink: string;
  resetPassword: string;
  newPassword: string;
  setPassword: string;
  passwordChanged: string;
  passwordLength: (count: number) => string;
  passwordLetter: string;
  passwordDigit: string;
  passwordStrength: string;
  passwordRules: string;
  strengthNone: string;
  strengthWeak: string;
  strengthFair: string;
  strengthGood: string;
  strengthStrong: string;
  met: string;
  notMet: string;
  twoFactorHeading: string;
  twoFactorDescription: string;
  recoveryDescription: string;
  verificationCode: string;
  recoveryCode: string;
  verify: string;
  useRecoveryCode: string;
  useCode: string;
  resendCode: string;
  codeResent: string;
  usePasskeyInstead: string;
  somethingWentWrong: string;
  recoveryCodes: string;
  recoveryCodesDescription: string;
  copyCodes: string;
  download: string;
  savedCodes: string;
  passkeyHeading: string;
  passkeyDescription: string;
  usePasskey: string;
  useAnotherWay: string;
  notifications: string;
  notificationsUnread: (count: number) => string;
  allNotifications: string;
  unreadNotifications: string;
  markAllRead: string;
  markRead: string;
  markUnread: string;
  unread: string;
  unreadItem: (title: string) => string;
  noNotifications: string;
  allCaughtUp: string;
  yesterday: string;
  other: string;
  viewAll: string;
  notificationSettings: string;
  showMoreResults: string;
  searchFailedPlain: string;
  createOption: (text: string) => string;
  showSuggestions: string;
  chosenItems: (label: string) => string;
  settings: string;
  allSettings: string;
  saved: string;
  dangerZone: string;
  closePanel: (panel: string) => string;
  resizePanel: string;
  panelWithCount: (panel: string, count: number) => string;
  steps: string;
  stepAnnounce: (step: string, total: string, label: string) => string;
  notGiven: string;
  editStep: (label: string) => string;
  skip: string;
  finish: string;
  chooseImage: string;
  changeImage: string;
  removeImage: string;
  chooseFromLibrary: string;
  cropImage: string;
  cropArea: string;
  cropHelp: string;
  zoom: string;
  aspectRatio: string;
  noCards: string;
  cardCount: (count: number) => string;
  cardCountOfLimit: (count: number, limit: number) => string;
  overLimit: string;
  collapseColumn: (column: string) => string;
  expandColumn: (column: string) => string;
  addCard: string;
  toColumn: (column: string) => string;
  addAnEmail: string;
  invalidEmail: (email: string) => string;
  inviteMembers: string;
  emailAddresses: string;
  emailsHint: string;
  role: string;
  sendInvites: string;
  pendingInvites: string;
  noPendingInvites: string;
  invitedBy: (name: string) => string;
  inviteExpired: string;
  sent: string;
  resend: string;
  resendTo: (email: string) => string;
  revoke: string;
  revokeFor: (email: string) => string;
  revokeInviteHeading: (email: string) => string;
  revokeInviteDescription: string;
  actionFailed: string;
  inviteLinks: string;
  noInviteLinks: string;
  createInviteLink: string;
  maxUses: string;
  expires: string;
  expiresLabel: string;
  never: string;
  neverExpires: string;
  inDays: (days: number) => string;
  usesCount: (uses: number) => string;
  usesOf: (uses: number, max: number) => string;
  copyLink: string;
  deactivate: string;
  deactivateLink: (url: string) => string;
  deactivateLinkHeading: string;
  deactivateLinkDescription: string;
  notANumber: string;
  cellsCopied: (count: number) => string;
  cellsPasted: (count: number) => string;
  groupOf: (value: string, count: number) => string;
  total: string;
  addRow: string;
  statusUntil: (time: string) => string;
  isTyping: (who: string, count: number) => string;
  othersCount: (count: number) => string;
  messageList: string;
  newMessagesMarker: string;
  jumpToLatest: string;
  newMessagesCount: (count: number) => string;
  loadingOlder: string;
  newMessageFrom: (name: string, text: string) => string;
  conversationStart: string;
  noMessages: string;
  messageActions: (author: string) => string;
  replyInThread: string;
  editMessage: string;
  deleteMessage: string;
  deleteMessageHeading: string;
  deleteMessageDescription: string;
  pinMessage: string;
  unpinMessage: string;
  pinned: string;
  replyCount: (count: number) => string;
  lastReply: string;
  notSent: string;
  attachments: string;
  downloadFile: (name: string) => string;
  openImage: (name: string) => string;
  messageWithAttachments: (count: number) => string;
  emojiPicker: string;
  searchEmoji: string;
  recentlyUsed: string;
  skinTone: string;
  skinToneName: (tone: number) => string;
  emojiGroup: (key: string) => string;
  emojiCategories: string;
  noEmojiFound: string;
  loadingEmoji: string;
  thread: string;
  conversations: string;
  unreadCount: (count: number) => string;
  mentionCount: (count: number) => string;
  muted: string;
  draft: string;
  privateConversation: string;
  call: string;
  participants: (count: number) => string;
  microphoneOff: string;
  cameraOff: string;
  speaking: string;
  presenting: (name: string) => string;
  turnOffCamera: string;
  turnOnCamera: string;
  shareScreen: string;
  stopSharing: string;
  leaveCall: string;
  devices: string;
  speaker: string;
  callControls: string;
  incomingCall: (name: string) => string;
  incomingVideoCall: string;
  incomingVoiceCall: string;
  accept: string;
  decline: string;
  callInProgress: string;
  joinCall: string;
  returnToCall: string;
  poorConnection: string;
  participantActions: (name: string) => string;
  pinParticipant: string;
  unpinParticipant: string;
  muteForMe: string;
  unmuteForMe: string;
  enterFullScreen: string;
  exitFullScreen: string;
  callWindow: string;
  moveCallWindow: string;
  assistant: string;
  messageAssistant: string;
  send: string;
  stopGenerating: string;
  regenerate: string;
  approve: string;
  reject: string;
  toolState: (name: string, state: string) => string;
  toolInput: string;
  toolOutput: string;
  sources: string;
  suggestions: string;
  generating: string;
  stoppedGenerating: string;
  replyFailed: string;
  editor: string;
  formatting: string;
  textStyle: string;
  paragraph: string;
  headingLevel: (level: number) => string;
  quote: string;
  codeBlock: string;
  bulletList: string;
  numberedList: string;
  checkList: string;
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  inlineCode: string;
  link: string;
  alignment: string;
  alignStart: string;
  alignCenter: string;
  alignEnd: string;
  justify: string;
  indent: string;
  outdent: string;
  undo: string;
  redo: string;
  insert: string;
  linkAddress: string;
  linkPlaceholder: string;
  invalidLink: string;
  editLink: string;
  removeLink: string;
  openLink: string;
  apply: string;
  charactersLeft: (count: number) => string;
  charactersOver: (count: number) => string;
  characterCount: (count: number, max: number) => string;
  table: string;
  tableSize: (rows: number, columns: number) => string;
  tableActions: string;
  insertRowBefore: string;
  insertRowAfter: string;
  insertColumnBefore: string;
  insertColumnAfter: string;
  deleteRow: string;
  deleteColumn: string;
  deleteTable: string;
  headerRow: string;
  image: string;
  imageAlt: string;
  imageCaption: string;
  embed: string;
  embedAddress: string;
  embedNotSupported: string;
  divider: string;
  uploadImage: string;
  mentions: string;
  blocks: string;
  noMatchingBlocks: string;
  emojiSuggestions: string;
  blockActions: string;
  dragBlock: string;
  moveUp: string;
  moveDown: string;
  duplicate: string;
  turnInto: string;
  insertBlock: string;
  searchBlocks: string;
  blockMoved: (position: number, total: number) => string;
  basicBlocks: string;
  mediaBlocks: string;
  message: string;
  sendMessage: string;
  newLineHint: string;
  attachFiles: string;
  scheduleSend: string;
  saveChanges: string;
  editingMessage: string;
  remoteCursor: (name: string) => string;
  saving: string;
  saveFailed: string;
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
  doNotDisturb: "Do not disturb",
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
  comments: "Comments",
  comment: "Comment",
  newComment: "New comment",
  commentPlaceholder: "Add a comment, @ to mention",
  reply: "Reply",
  replyPlaceholder: "Reply, @ to mention",
  editComment: "Edit comment",
  edit: "Edit",
  delete: "Delete",
  edited: "(edited)",
  sending: "Sending…",
  sendFailed: "Not sent",
  editFailed: "The change was not saved",
  deleteFailed: "It could not be deleted",
  retry: "Retry",
  you: "You",
  commentActions: (author) => `Actions for ${author}'s comment`,
  deleteCommentHeading: "Delete the comment?",
  deleteCommentDescription: "It is removed for everyone, and cannot be brought back.",
  reactions: "Reactions",
  addReaction: "Add a reaction",
  reactedWith: (emoji, count, who) =>
    `${emoji}, ${count === 1 ? "1 reaction" : `${String(count)} reactions`}${who === undefined ? "" : ` from ${who}`}`,
  mentionSuggestions: "People to mention",
  threadBy: (author) => `Thread by ${author}`,
  threadOn: (anchor) => `On “${anchor}”`,
  showAnchor: (anchor) => `Show “${anchor}”`,
  detachedAnchor: "What this was on has changed",
  resolve: "Resolve",
  reopen: "Reopen",
  resolved: "Resolved",
  openThreads: "Open",
  resolvedThreads: "Resolved",
  allThreads: "All",
  noComments: "No comments yet",
  mediaControls: "Media controls",
  seek: "Seek",
  timeOf: (time, total) => `${time} of ${total}`,
  mute: "Mute",
  unmute: "Unmute",
  volume: "Volume",
  chapters: "Chapters",
  chapterNow: (title) => `Chapter: ${title}`,
  playbackSpeed: "Playback speed",
  normalSpeed: "Normal",
  captions: "Captions",
  captionsOff: "Off",
  transcript: "Transcript",
  pictureInPicture: "Picture in picture",
  exitPictureInPicture: "Exit picture in picture",
  fullscreen: "Full screen",
  exitFullscreen: "Exit full screen",
  recordAudio: "Record audio",
  recordVideo: "Record video",
  microphone: "microphone",
  camera: "camera",
  recorderIntro: (device) => `Recording uses your ${device}. Nothing is kept until you use it.`,
  turnOn: (device) => `Turn on the ${device}`,
  permissionDenied: (device) => `The ${device} is blocked`,
  permissionHelp: (device) =>
    `Allow the ${device} for this site in the browser's address bar or settings, then try again.`,
  deviceMissing: (device) => `No ${device} was found`,
  recordingUnsupported: "This browser cannot record here",
  chooseDevice: (device) => `Choose a ${device}`,
  cameraPreview: "Camera preview",
  startRecording: "Record",
  stopRecording: "Stop",
  recordingStarted: "Recording",
  recordedFor: (duration) => `Recorded ${duration}`,
  recordingPreview: "Recording",
  recordAgain: "Record again",
  useRecording: "Use recording",
  attachFailed: "The recording could not be used. Try again.",
  versionHistory: "Version history",
  versions: "Versions",
  currentVersion: "Current",
  previousVersion: "The version before",
  preview: "Preview",
  compare: "Compare",
  compareWith: "Compare with",
  restore: "Restore",
  restoreHeading: (version) => `Restore ${version}?`,
  restoreDescription: "It becomes the current version. The current one stays in the history.",
  restoreFailed: "The version could not be restored. Try again.",
  noVersions: "No versions yet",
  nothingToCompare: "There is nothing to compare it with.",
  or: "or",
  signIn: "Sign in",
  signUp: "Create an account",
  email: "Email",
  password: "Password",
  fullName: "Full name",
  rememberMe: "Remember me",
  forgotPassword: "Forgot password?",
  emailInvalid: "Enter an email address",
  passwordRequired: "Enter your password",
  nameRequired: "Enter your name",
  passwordWeak: "The password does not meet every rule",
  passwordsDiffer: "The passwords do not match",
  confirmPassword: "Confirm password",
  termsRequired: "Agree to continue",
  emailMeLink: "Email me a link",
  usePassword: "Use a password",
  sendLink: "Send link",
  linkFailed: "The link could not be sent. Try again.",
  checkInbox: "Check your inbox",
  linkSent: (email) => `We sent a sign-in link to ${email}.`,
  confirmSent: (email) => `We sent a link to ${email} to confirm the address.`,
  resetSent: (email) => `If ${email} has an account, we sent it a link to choose a new password.`,
  signInWithPasskey: "Sign in with a passkey",
  passkeyFailed: "The passkey did not work. Try again or use another way.",
  forgotPasswordHeading: "Reset your password",
  forgotPasswordDescription:
    "Enter your email and we will send you a link to choose a new password.",
  sendResetLink: "Send reset link",
  resetPassword: "Choose a new password",
  newPassword: "New password",
  setPassword: "Set password",
  passwordChanged: "Your password is changed",
  passwordLength: (count) => `At least ${String(count)} characters`,
  passwordLetter: "A letter",
  passwordDigit: "A number",
  passwordStrength: "Password strength",
  passwordRules: "Password rules",
  strengthNone: "None",
  strengthWeak: "Weak",
  strengthFair: "Fair",
  strengthGood: "Good",
  strengthStrong: "Strong",
  met: "met",
  notMet: "not met",
  twoFactorHeading: "Two-step verification",
  twoFactorDescription: "Enter the code from your authenticator app.",
  recoveryDescription: "Enter one of the recovery codes you saved.",
  verificationCode: "Verification code",
  recoveryCode: "Recovery code",
  verify: "Verify",
  useRecoveryCode: "Use a recovery code",
  useCode: "Use a verification code",
  resendCode: "Send a new code",
  codeResent: "A new code is on its way.",
  usePasskeyInstead: "Use a passkey instead",
  somethingWentWrong: "Something went wrong. Try again.",
  recoveryCodes: "Recovery codes",
  recoveryCodesDescription:
    "Each code signs you in once if you lose your device. Keep them somewhere safe.",
  copyCodes: "Copy codes",
  download: "Download",
  savedCodes: "I have saved these codes",
  passkeyHeading: "Use your passkey",
  passkeyDescription: "Confirm it is you with your fingerprint, face or screen lock.",
  usePasskey: "Use passkey",
  useAnotherWay: "Use another way",
  notifications: "Notifications",
  notificationsUnread: (count) => `Notifications, ${String(count)} unread`,
  allNotifications: "All",
  unreadNotifications: "Unread",
  markAllRead: "Mark all as read",
  markRead: "Mark as read",
  markUnread: "Mark as unread",
  unread: "Unread",
  unreadItem: (title) => `Unread: ${title}`,
  noNotifications: "No notifications yet",
  allCaughtUp: "You're all caught up",
  yesterday: "Yesterday",
  other: "Other",
  viewAll: "View all",
  notificationSettings: "Notification settings",
  showMoreResults: "Show more results",
  searchFailedPlain: "The search did not work. Try again.",
  createOption: (text) => `Create “${text}”`,
  showSuggestions: "Show suggestions",
  chosenItems: (label) => `Chosen ${label.toLocaleLowerCase()}`,
  settings: "Settings",
  allSettings: "All settings",
  saved: "Saved",
  dangerZone: "Danger zone",
  closePanel: (panel) => `Close ${panel}`,
  resizePanel: "Resize the panel",
  panelWithCount: (panel, count) => `${panel}, ${String(count)}`,
  steps: "Steps",
  stepAnnounce: (step, total, label) => `Step ${step} of ${total}: ${label}`,
  notGiven: "Not given",
  editStep: (label) => `Edit ${label}`,
  skip: "Skip",
  finish: "Finish",
  chooseImage: "Choose an image",
  changeImage: "Change",
  removeImage: "Remove",
  chooseFromLibrary: "Choose from library",
  cropImage: "Crop the image",
  cropArea: "Crop area",
  cropHelp: "Drag the image or use the arrow keys to move it, and + and − to zoom.",
  zoom: "Zoom",
  aspectRatio: "Aspect ratio",
  noCards: "No cards",
  cardCount: (count) => (count === 1 ? "1 card" : `${String(count)} cards`),
  cardCountOfLimit: (count, limit) => `${String(count)} of ${String(limit)} cards`,
  overLimit: "over its limit",
  collapseColumn: (column) => `Collapse ${column}`,
  expandColumn: (column) => `Expand ${column}`,
  addCard: "Add card",
  toColumn: (column) => ` to ${column}`,
  addAnEmail: "Add at least one email address",
  invalidEmail: (email) => `${email} is not an email address`,
  inviteMembers: "Invite members",
  emailAddresses: "Email addresses",
  emailsHint: "Separate addresses with commas or spaces, or paste a list.",
  role: "Role",
  sendInvites: "Send invites",
  pendingInvites: "Pending invitations",
  noPendingInvites: "No pending invitations",
  invitedBy: (name) => `invited by ${name}`,
  inviteExpired: "Expired",
  sent: "Sent",
  resend: "Resend",
  resendTo: (email) => `Resend the invitation to ${email}`,
  revoke: "Revoke",
  revokeFor: (email) => `Revoke the invitation to ${email}`,
  revokeInviteHeading: (email) => `Revoke the invitation to ${email}?`,
  revokeInviteDescription: "The link in it stops working.",
  actionFailed: "That did not work. Try again.",
  inviteLinks: "Invite links",
  noInviteLinks: "No invite links",
  createInviteLink: "Create link",
  maxUses: "Uses",
  expires: "Expires",
  expiresLabel: "Expires",
  never: "Never",
  neverExpires: "Never expires",
  inDays: (days) => (days === 1 ? "In 1 day" : `In ${String(days)} days`),
  usesCount: (uses) => (uses === 1 ? "1 use" : `${String(uses)} uses`),
  usesOf: (uses, max) => `${String(uses)} of ${String(max)} uses`,
  copyLink: "Copy link",
  deactivate: "Deactivate",
  deactivateLink: (url) => `Deactivate ${url}`,
  deactivateLinkHeading: "Deactivate the link?",
  deactivateLinkDescription: "Anyone who has it can no longer join with it.",
  notANumber: "Enter a number",
  cellsCopied: (count) => (count === 1 ? "Copied 1 cell" : `Copied ${String(count)} cells`),
  cellsPasted: (count) => (count === 1 ? "Pasted 1 cell" : `Pasted ${String(count)} cells`),
  groupOf: (value, count) => `${value}, ${String(count)} rows`,
  total: "Total",
  addRow: "Add row",
  statusUntil: (time) => `until ${time}`,
  isTyping: (who, count) => (count === 1 ? `${who} is typing` : `${who} are typing`),
  othersCount: (count) => (count === 1 ? "1 other" : `${String(count)} others`),
  messageList: "Messages",
  newMessagesMarker: "New",
  jumpToLatest: "Jump to latest",
  newMessagesCount: (count) => (count === 1 ? "1 new message" : `${String(count)} new messages`),
  loadingOlder: "Loading earlier messages",
  newMessageFrom: (name, text) => `${name}: ${text}`,
  conversationStart: "This is the start of the conversation",
  noMessages: "No messages yet",
  messageActions: (author) => `Message from ${author}`,
  replyInThread: "Reply in thread",
  editMessage: "Edit message",
  deleteMessage: "Delete message",
  deleteMessageHeading: "Delete this message?",
  deleteMessageDescription: "It is removed for everyone in the conversation.",
  pinMessage: "Pin to conversation",
  unpinMessage: "Unpin from conversation",
  pinned: "Pinned",
  replyCount: (count) => (count === 1 ? "1 reply" : `${String(count)} replies`),
  lastReply: "Last reply",
  notSent: "Not sent",
  attachments: "Attachments",
  downloadFile: (name) => `Download ${name}`,
  openImage: (name) => `Open ${name}`,
  messageWithAttachments: (count) =>
    count === 1 ? "1 attachment" : `${String(count)} attachments`,
  emojiPicker: "Choose an emoji",
  searchEmoji: "Search emoji",
  recentlyUsed: "Recently used",
  skinTone: "Skin tone",
  skinToneName: (tone) =>
    ["Default", "Light", "Medium-light", "Medium", "Medium-dark", "Dark"][tone] ?? "Default",
  emojiGroup: (key) =>
    ({
      "smileys-emotion": "Smileys & emotion",
      "people-body": "People & body",
      "animals-nature": "Animals & nature",
      "food-drink": "Food & drink",
      "travel-places": "Travel & places",
      activities: "Activities",
      objects: "Objects",
      symbols: "Symbols",
      flags: "Flags",
    })[key] ?? key,
  emojiCategories: "Emoji categories",
  noEmojiFound: "No emoji found",
  loadingEmoji: "Loading emoji",
  thread: "Thread",
  conversations: "Conversations",
  unreadCount: (count) => `${String(count)} unread`,
  mentionCount: (count) => (count === 1 ? "1 mention" : `${String(count)} mentions`),
  muted: "Muted",
  draft: "Draft",
  privateConversation: "Private",
  call: "Call",
  participants: (count) => (count === 1 ? "1 participant" : `${String(count)} participants`),
  microphoneOff: "Microphone off",
  cameraOff: "Camera off",
  speaking: "Speaking",
  presenting: (name) => `${name} is presenting`,
  turnOffCamera: "Turn off camera",
  turnOnCamera: "Turn on camera",
  shareScreen: "Share screen",
  stopSharing: "Stop sharing",
  leaveCall: "Leave call",
  devices: "Devices",
  speaker: "Speaker",
  callControls: "Call controls",
  incomingCall: (name) => `${name} is calling`,
  incomingVideoCall: "Incoming video call",
  incomingVoiceCall: "Incoming voice call",
  accept: "Accept",
  decline: "Decline",
  callInProgress: "Call in progress",
  joinCall: "Join",
  returnToCall: "Return to call",
  poorConnection: "Poor connection",
  participantActions: (name) => `${name}: more`,
  pinParticipant: "Pin",
  unpinParticipant: "Unpin",
  muteForMe: "Mute for me",
  unmuteForMe: "Unmute for me",
  enterFullScreen: "Full screen",
  exitFullScreen: "Exit full screen",
  callWindow: "Call window",
  moveCallWindow: "Move the call window: drag it, or use the arrow keys",
  assistant: "Assistant",
  messageAssistant: "Message the assistant",
  send: "Send",
  stopGenerating: "Stop",
  regenerate: "Regenerate",
  approve: "Approve",
  reject: "Reject",
  toolState: (name, state) =>
    ({
      running: `Running ${name}`,
      done: `Ran ${name}`,
      error: `${name} failed`,
      "awaiting-approval": `${name} needs your approval`,
      approved: `${name} approved`,
      rejected: `${name} rejected`,
    })[state] ?? name,
  toolInput: "Input",
  toolOutput: "Result",
  sources: "Sources",
  suggestions: "Suggestions",
  generating: "Writing a reply",
  stoppedGenerating: "Stopped",
  replyFailed: "The reply could not be finished",
  editor: "Editor",
  formatting: "Formatting",
  textStyle: "Text style",
  paragraph: "Text",
  headingLevel: (level) => `Heading ${String(level)}`,
  quote: "Quote",
  codeBlock: "Code block",
  bulletList: "Bulleted list",
  numberedList: "Numbered list",
  checkList: "Checklist",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikethrough: "Strikethrough",
  inlineCode: "Code",
  link: "Link",
  alignment: "Alignment",
  alignStart: "Align to the start",
  alignCenter: "Centre",
  alignEnd: "Align to the end",
  justify: "Justify",
  indent: "Indent",
  outdent: "Outdent",
  undo: "Undo",
  redo: "Redo",
  insert: "Insert",
  linkAddress: "Link address",
  linkPlaceholder: "https://example.com",
  invalidLink: "Enter a web address, an email address or a path",
  editLink: "Edit link",
  removeLink: "Remove link",
  openLink: "Open link",
  apply: "Apply",
  charactersLeft: (count) =>
    count === 1 ? "1 character left" : `${String(count)} characters left`,
  charactersOver: (count) =>
    count === 1 ? "1 character too many" : `${String(count)} characters too many`,
  characterCount: (count, max) => `${String(count)} of ${String(max)} characters`,
  table: "Table",
  tableSize: (rows, columns) => `${String(rows)} by ${String(columns)} table`,
  tableActions: "Table actions",
  insertRowBefore: "Insert row above",
  insertRowAfter: "Insert row below",
  insertColumnBefore: "Insert column before",
  insertColumnAfter: "Insert column after",
  deleteRow: "Delete row",
  deleteColumn: "Delete column",
  deleteTable: "Delete table",
  headerRow: "Header row",
  image: "Image",
  imageAlt: "Alternative text",
  imageCaption: "Caption",
  embed: "Embed",
  embedAddress: "Address to embed",
  embedNotSupported: "That address cannot be embedded",
  divider: "Divider",
  uploadImage: "Upload an image",
  mentions: "Mentions",
  blocks: "Blocks",
  noMatchingBlocks: "No matching blocks",
  emojiSuggestions: "Emoji",
  blockActions: "Block actions",
  dragBlock: "Drag to move, or press for actions",
  moveUp: "Move up",
  moveDown: "Move down",
  duplicate: "Duplicate",
  turnInto: "Turn into",
  insertBlock: "Insert a block",
  searchBlocks: "Search blocks",
  blockMoved: (position, total) => `Moved to ${String(position)} of ${String(total)}`,
  basicBlocks: "Basic",
  mediaBlocks: "Media",
  message: "Message",
  sendMessage: "Send message",
  newLineHint: "Shift+Enter for a new line",
  attachFiles: "Attach files",
  scheduleSend: "Schedule send",
  saveChanges: "Save changes",
  editingMessage: "Editing message",
  remoteCursor: (name) => `${name}'s cursor`,
  saving: "Saving…",
  saveFailed: "Not saved",
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
