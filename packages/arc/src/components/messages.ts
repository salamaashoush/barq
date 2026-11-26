import { createContext, getOwner, install, useContext } from "@barqjs/core";

import type { PanelLayout } from "../editor/panels-view.tsx";

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
  details: string;
  previousRecord: string;
  nextRecord: string;
  recordPosition: (position: number, count: number) => string;
  backToList: string;
  selectItemOf: (name: string) => string;
  resizeColumn: string;
  nothingHere: string;
  filters: string;
  clearFilters: string;
  view: string;
  columns: string;
  selected: (count: number) => string;
  clearSelection: string;
  selection: string;
  actions: string;
  actionsFor: (name: string) => string;
  showing: (shown: string) => string;
  showingAll: (shown: string) => string;
  showingOf: (shown: string, total: string) => string;
  couldNotLoad: (label: string) => string;
  requestId: (id: string) => string;
  tryAgain: string;
  totals: string;
  bulkProgress: (settled: number, total: number) => string;
  appliesTo: (count: number, total: number) => string;
  bulkPartial: (done: number, total: number, reason: string) => string;
  retryFailed: string;
  filtersApplied: (count: number) => string;
  clearFilter: string;
  searchOptions: (label: string) => string;
  anyTime: string;
  since: (day: string) => string;
  until: (day: string) => string;
  views: string;
  viewEdited: (name: string) => string;
  yourViews: string;
  sharedViews: string;
  saveAsView: string;
  updateView: (name: string) => string;
  renameView: string;
  openOnView: string;
  stopOpeningOnView: string;
  opensByDefault: string;
  copyViewLink: string;
  deleteView: string;
  saveView: string;
  changeView: (name: string) => string;
  saveViewDescription: string;
  changeViewDescription: string;
  viewName: string;
  viewNamePlaceholder: string;
  shareView: string;
  shareViewHint: string;
  openOnViewHint: string;
  timeRange: string;
  lastHours: (hours: number) => string;
  customRange: string;
  live: string;
  rangeFrom: string;
  rangeTo: string;
  rangeOrder: string;
  fromScope: (owner: string) => string;
  editIn: string;
  noneInScope: string;
  discardHeading: string;
  discardDescription: string;
  discard: string;
  keepEditing: string;
  savedWhenOnline: string;
  notSavedYet: string;
  settingNotChanged: string;
  alsoTurnedOn: (features: string) => string;
  alsoTurnedOff: (features: string) => string;
  needsFeature: (features: string) => string;
  recordNotLoaded: string;
  errorSummary: string;
  errorSummaryItem: (label: string, message: string) => string;
  unsavedChanges: string;
  discardChanges: string;
  calendarFeedLink: string;
  calendarFeedCopy: string;
  calendarFeedOpenIn: string;
  calendarGoogle: string;
  calendarApple: string;
  calendarOutlook: string;
  calendarFeedOnce: string;
  calendarFeedMake: string;
  calendarFeedMade: string;
  calendarFeedLastRead: string;
  calendarFeedNeverRead: string;
  calendarFeedDelay: string;
  calendarReset: string;
  calendarResetTitle: string;
  calendarResetDescription: string;
  notificationKind: string;
  preferenceAll: (group: string, channel: string) => string;
  preferenceCell: (kind: string, channel: string) => string;
  mixed: string;
  clockZone: string;
  clockLocalZone: string;
  clockUtcHint: string;
  clockHours: string;
  clockTwelve: string;
  clockTwentyFour: string;
  weekStart: string;
  weekStartLocale: string;
  everyMinute: string;
  hourly: string;
  daily: string;
  weekly: string;
  everyInterval: (span: string) => string;
  themeNotSaved: string;
  typeToConfirm: (text: string) => string;
  checkingDependents: string;
  blockedTitle: string;
  blockedDescription: string;
  dependsOnIt: (count: number) => string;
  andMore: (count: number) => string;
  dependentsFailed: string;
  loading: string;
  modalFailed: string;
  allDone: string;
  restrictedHeading: string;
  askAnAdmin: string;
  askForAccess: (names: string) => string;
  noMatchesHeading: string;
  noMatchesDescription: string;
  nextSteps: string;
  statusHeading: (
    kind: "not-found" | "forbidden" | "gone" | "signed-out" | "offline" | "unreachable" | "failed",
  ) => string;
  statusDescription: (
    kind: "not-found" | "forbidden" | "gone" | "signed-out" | "offline" | "unreachable" | "failed",
  ) => string;
  goHome: string;
  goBack: string;
  errorDetails: string;
  none: string;
  notSet: string;
  noLimit: string;
  nobody: string;
  notRecorded: string;
  notApplicable: string;
  timeLeft: (duration: string) => string;
  timeUp: string;
  sessionEndsIn: (time: string) => string;
  sessionIdle: string;
  sessionLimit: string;
  keepAlive: string;
  extendSession: string;
  sessionEnded: string;
  restoreNamed: (name: string) => string;
  archivedOn: (by: string | undefined, date: string) => string;
  deletedOn: (by: string | undefined, date: string) => string;
  archivedHint: string;
  deletedHint: string;
  purgedIn: (time: string) => string;
  reviewStage: string;
  stageName: (stage: "none" | "draft" | "review" | "completed") => string;
  startDocument: string;
  documentLocked: string;
  publish: string;
  saveBeforePublishing: string;
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
  chooseTableSize: string;
  imageDetails: string;
  altText: string;
  altTextHint: string;
  blockPlaceholder: string;
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
  layoutBlocks: string;
  callout: string;
  calloutTone: string;
  calloutToneName: (tone: "neutral" | "info" | "success" | "warning" | "danger") => string;
  twoColumns: string;
  threeColumns: string;
  columnLayout: string;
  columnLayoutName: (shares: readonly number[]) => string;
  toggle: string;
  toggleTitle: string;
  toggleExpanded: string;
  toggleCollapsed: string;
  panelLayout: string;
  panelLayoutName: (layout: PanelLayout) => string;
  panelLayoutHint: (layout: PanelLayout) => string;
  panelTitle: (layout: PanelLayout) => string;
  addPanel: (layout: PanelLayout) => string;
  turnCardOver: string;
  turnCardBack: string;
  chooseAgain: string;
  chosenPath: string;
  sharedBlock: string;
  sharedBlockHint: string;
  editSharedBlock: string;
  copySharedBlockHere: string;
  keepAsSharedBlock: string;
  pageBreak: string;
  footnote: string;
  footnotes: string;
  addFootnote: string;
  footnoteHint: string;
  removeFootnote: string;
  footnoteReference: (number: string) => string;
  backToReference: (number: string) => string;
  findAndReplace: string;
  findText: string;
  replaceWith: string;
  previousMatch: string;
  nextMatch: string;
  matchCase: string;
  wholeWords: string;
  matchCount: (current: number, total: number) => string;
  replaceOne: string;
  replaceAll: string;
  wordCount: (count: number) => string;
  readingTime: (minutes: number) => string;
  outline: string;
  outlineEmpty: string;
  focusMode: string;
  leaveFocusMode: string;
  wordDocument: string;
  readingWordDocument: string;
  wordDocumentRead: string;
  wordPicturesSkipped: (count: number) => string;
  wordDocumentFailed: string;
  textTracks: string;
  audioDescription: string;
  captionsHint: string;
  addCaptionLine: string;
  captionStart: (line: number) => string;
  captionEnd: (line: number) => string;
  captionText: (line: number) => string;
  removeCaptionLine: (line: number) => string;
  captionsLanguage: string;
  captionsEmpty: string;
  uploadCaptions: string;
  saveCaptions: string;
  captionsTimeProblem: string;
  captionsSaveFailed: string;
  draftCaptions: string;
  draftWaiting: string;
  drafting: (percent: number) => string;
  useDraft: string;
  draftNote: string;
  draftFailed: string;
  descriptionsHelp: string;
  descriptionAddAt: (time: string) => string;
  descriptionsHint: string;
  descriptionsSkipped: (count: number) => string;
  transcriptHint: string;
  imageSize: string;
  imageSizeName: (size: "small" | "medium" | "large" | "full") => string;
  imageDecorative: string;
  imageAltMissing: string;
  imageCredit: string;
  imageCreditAuthor: string;
  imageCreditLicence: string;
  imageCreditSource: string;
  imageCreditAllRights: string;
  imageCreditPublicDomain: string;
  imageFocus: string;
  imageFocusHint: string;
  imageFocusAt: (x: number, y: number) => string;
  pictureLabels: string;
  addPictureLabel: string;
  pictureLabel: (number: string) => string;
  movePictureLabel: (number: string) => string;
  pictureLabelTitle: (number: string) => string;
  pictureLabelTitlePlaceholder: string;
  pictureLabelText: (number: string) => string;
  pictureLabelTextPlaceholder: string;
  removePictureLabel: (number: string) => string;
  gallery: string;
  galleryAdd: string;
  galleryEmpty: string;
  editGallery: string;
  galleryOrderHint: string;
  pictureOf: (number: string, total: string) => string;
  pictureEarlier: string;
  pictureLater: string;
  removePicture: string;
  pictureAltMissing: string;
  compareBefore: string;
  compareAfter: string;
  compareSlider: string;
  compareShown: (before: string, percent: number) => string;
  compareChoose: (side: string) => string;
  editComparison: string;
  fileBlock: string;
  fileCaption: string;
  fileNoPreview: string;
  openFile: (name: string) => string;
  viewFile: string;
  copyFileLink: string;
  newFileVersion: string;
  fileDisplay: string;
  fileShowCard: string;
  fileShowPages: string;
  cut: string;
  paste: string;
  pasteAsText: string;
  superscript: string;
  subscript: string;
  textColour: string;
  highlight: string;
  defaultColour: string;
  colourName: (
    colour: "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red",
  ) => string;
  textSize: string;
  textSizeName: (size: "small" | "normal" | "large" | "huge") => string;
  clearFormatting: string;
  documentInvalid: string;
  markdown: string;
  markdownHint: string;
  replaceFromMarkdown: string;
  blockToolbar: string;
  blockGroups: string;
  tableRow: (row: number) => string;
  tableColumn: (column: number) => string;
  dragTableLine: string;
  moveRowUp: string;
  moveRowDown: string;
  moveColumnBefore: string;
  moveColumnAfter: string;
  headerColumn: string;
  mergeCells: string;
  splitCell: string;
  cellColour: string;
  cellAlignment: string;
  verticalAlignment: string;
  alignTop: string;
  alignMiddle: string;
  alignBottom: string;
  stripedRows: string;
  lineAbove: string;
  lineBelow: string;
  tableMoved: (kind: "row" | "column", position: number, total: number) => string;
  codeLanguage: string;
  plainText: string;
  identifierUpperSnake: string;
  identifierSnake: string;
  identifierKebab: string;
  identifierFilename: string;
  slugAt: (address: string) => string;
  change: string;
  slugChecking: string;
  slugFree: (slug: string) => string;
  slugTaken: (slug: string) => string;
  slugCheckFailed: string;
  noSuggestions: string;
  couldNotSave: string;
  noneChosen: string;
  pickAtLeastOne: string;
  search: string;
  add: string;
  hiddenOptions: (count: number) => string;
  fillBothOrNeither: string;
  lowContrast: (against: string, ratio: string, minimum: string) => string;
  holdsAnError: string;
  rowOf: (position: number) => string;
  rowAdded: (row: string) => string;
  rowRemoved: (row: string) => string;
  rowMoved: (row: string, position: number, total: number) => string;
  moveRowUpOf: (row: string) => string;
  moveRowDownOf: (row: string) => string;
  removeRowOf: (row: string) => string;
  editRecordOf: (record: string) => string;
  addRecord: string;
  records: string;
  addressCountry: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: (kind: string) => string;
  addressPostal: (kind: string) => string;
  uploadsPending: string;
  attachedFiles: string;
  showValue: string;
  hideValue: string;
  severalLines: string;
  typeSecret: string;
  typeSecretAgain: string;
  typeItAgain: string;
  storedSecretPlaceholder: string;
  storedSecretEnding: (hint: string) => string;
  storedSecretMoved: string;
  storedSecretSince: (hint: string, since: string) => string;
  storedSecretKept: string;
  forgottenOnSave: string;
  keepIt: string;
  forgetIt: string;
  chooseSecret: string;
  secretNotFound: (name: string) => string;
  missingSecret: (name: string) => string;
  notASecretReference: string;
  copyOf: (name: string) => string;
  chooseAFile: string;
  orPasteIt: string;
  readFromFile: (name: string, size: string) => string;
  hiddenValue: string;
  showNamed: (name: string) => string;
  hideNamed: (name: string) => string;
  couldNotReveal: string;
  newSecretHeading: string;
  shownOnce: string;
  copySecret: string;
  worksUntil: (moment: string) => string;
  storedItSafely: string;
  secretWord: string;
  redacted: string;
  scopeOutsideRole: string;
  credentialCapture: string;
  credentialExisting: string;
  credentialNew: string;
  credentialSourceOf: (name: string) => string;
  credentialSecretOf: (name: string) => string;
  credentialValueOf: (name: string) => string;
  credentialScopeOf: (name: string) => string;
  chooseSecretFor: (name: string) => string;
  typeValueOf: (name: string) => string;
  credentialsUnbound: string;
  everywhere: string;
  onlyIn: (scope: string) => string;
  readsSecret: (secret: string) => string;
  credentialCaptured: string;
  credentialTyped: string;
  sessions: string;
  sessionClient: string;
  sessionWhere: string;
  sessionActive: string;
  thisDevice: string;
  unknownPlace: string;
  noSessions: string;
  signOut: string;
  signedOut: string;
  signOutOthers: string;
  signOutOthersHeading: string;
  signOutOthersDescription: (count: number) => string;
  connectedApps: string;
  noConnectedApps: string;
  appColumn: string;
  appState: string;
  appConnected: string;
  appBlocked: string;
  connectedBy: string;
  appAccess: string;
  scopesOf: (name: string) => string;
  lastUsed: string;
  connectedAt: string;
  disconnect: string;
  disconnectHeading: (name: string) => string;
  disconnectDescription: string;
  appsMayConnect: string;
  connectAt: string;
  copyAddress: string;
  apiKeys: string;
  noApiKeys: string;
  noApiKeysDescription: string;
  keyName: string;
  keyColumn: string;
  keyCount: (count: number) => string;
  everyScope: string;
  scopes: string;
  expired: string;
  createKey: string;
  createKeyHeading: string;
  createKeyDescription: string;
  copyNewKey: string;
  copyTheKey: string;
  defaultKeyName: string;
  nameTheKey: string;
  expiresHint: string;
  neverExpiresHint: string;
  revokeKey: string;
  revokeKeyHeading: (name: string) => string;
  revokeKeyDescription: string;
  testConnection: string;
  test: string;
  probeHint: string;
  testingConnection: string;
  connectionWorked: string;
  connectionFailed: string;
  connectionTestFailed: string;
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
  details: "Details",
  previousRecord: "Previous",
  nextRecord: "Next",
  recordPosition: (position, count) => `${String(position)} of ${String(count)}`,
  backToList: "Back to the list",
  selectItemOf: (name) => `Select ${name}`,
  resizeColumn: "Resize column",
  nothingHere: "Nothing here yet",
  filters: "Filters",
  clearFilters: "Clear filters",
  view: "View",
  columns: "Columns",
  selected: (count) => `${String(count)} selected`,
  clearSelection: "Clear selection",
  selection: "Selection",
  actions: "Actions",
  actionsFor: (name) => (name === "" ? "Actions" : `Actions for ${name}`),
  showing: (shown) => `Showing ${shown}`,
  showingAll: (shown) => `Showing ${shown}, all loaded`,
  showingOf: (shown, total) => `Showing ${shown} of ${total}`,
  couldNotLoad: (label) => `Could not load ${label.toLocaleLowerCase("en")}`,
  requestId: (id) => `Request ID ${id}`,
  tryAgain: "Try again",
  totals: "Totals",
  bulkProgress: (settled, total) => `${String(settled)} of ${String(total)} done`,
  appliesTo: (count, total) => `applies to ${String(count)} of ${String(total)}`,
  bulkPartial: (done, total, reason) =>
    `${String(done)} of ${String(total)} went through. ${reason}`,
  retryFailed: "Retry failed",
  filtersApplied: (count) =>
    count === 1 ? "1 filter applied" : `${String(count)} filters applied`,
  clearFilter: "Clear filter",
  searchOptions: (label) => `Search ${label.toLocaleLowerCase("en")}`,
  anyTime: "Any time",
  since: (day) => `Since ${day}`,
  until: (day) => `Until ${day}`,
  views: "Views",
  viewEdited: (name) => `${name} (edited)`,
  yourViews: "Your views",
  sharedViews: "Shared",
  saveAsView: "Save as a new view…",
  updateView: (name) => `Update ${name}`,
  renameView: "Rename or share…",
  openOnView: "Open the list on it",
  stopOpeningOnView: "Stop opening on it",
  opensByDefault: "Opens by default",
  copyViewLink: "Copy link",
  deleteView: "Delete view",
  saveView: "Save view",
  changeView: (name) => `Change ${name}`,
  saveViewDescription: "The list's filters, sort and columns as they are now, under a name.",
  changeViewDescription:
    "Its filters stay as they are; Update in the Views menu saves the list as it is set up now.",
  viewName: "Name",
  viewNamePlaceholder: "Failing in production",
  shareView: "Share with everyone",
  shareViewHint: "Everyone who sees this list sees it in their Views menu.",
  openOnViewHint: "The list opens on this view when its address names none.",
  timeRange: "Time range",
  lastHours: (hours) => (hours === 1 ? "Last hour" : `Last ${String(hours)} hours`),
  customRange: "Custom",
  live: "Live",
  rangeFrom: "From",
  rangeTo: "To",
  rangeOrder: "The end has to come after the start",
  fromScope: (owner) => `From ${owner}`,
  editIn: "Read only here. Edit them in",
  noneInScope: "None.",
  discardHeading: "Discard unsaved changes?",
  discardDescription: "What you changed here has not been saved.",
  discard: "Discard",
  keepEditing: "Keep editing",
  savedWhenOnline: "Offline. Saves when you reconnect",
  notSavedYet: "Not saved yet",
  settingNotChanged: "The setting was not changed",
  alsoTurnedOn: (features) => `Also turned on: ${features}`,
  alsoTurnedOff: (features) => `Also turned off: ${features}`,
  needsFeature: (features) => `Needs ${features}`,
  recordNotLoaded: "This could not be loaded",
  errorSummary: "There is a problem",
  errorSummaryItem: (label, message) => (message === "" ? label : `${label}: ${message}`),
  unsavedChanges: "Unsaved changes",
  discardChanges: "Discard changes",
  calendarFeedLink: "Calendar link",
  calendarFeedCopy: "Copy the calendar link",
  calendarFeedOpenIn: "Add to a calendar",
  calendarGoogle: "Google Calendar",
  calendarApple: "Apple Calendar",
  calendarOutlook: "Outlook",
  calendarFeedOnce:
    "The link is shown this once. Anyone who has it sees this calendar, so keep it to yourself.",
  calendarFeedMake: "Make a calendar link",
  calendarFeedMade: "Link made",
  calendarFeedLastRead: "Last read by a calendar",
  calendarFeedNeverRead: "Not yet",
  calendarFeedDelay: "Calendar apps check a subscription every few hours, so changes show up late.",
  calendarReset: "Make a new link",
  calendarResetTitle: "Make a new calendar link?",
  calendarResetDescription:
    "The current link stops working, and calendars subscribed to it stop updating.",
  notificationKind: "Notification",
  preferenceAll: (group, channel) => `All of ${group}: ${channel}`,
  preferenceCell: (kind, channel) => `${kind}: ${channel}`,
  mixed: "Mixed",
  clockZone: "Time zone",
  clockLocalZone: "Your time zone",
  clockUtcHint: "One clock for everyone, as logs keep.",
  clockHours: "Clock",
  clockTwelve: "12-hour",
  clockTwentyFour: "24-hour",
  weekStart: "Week starts on",
  weekStartLocale: "As your language has it",
  everyMinute: "Every minute",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  everyInterval: (span) => `Every ${span}`,
  themeNotSaved: "The theme was not saved to your account",
  typeToConfirm: (text) => `To confirm, type ${text}`,
  checkingDependents: "Checking what depends on it…",
  blockedTitle: "This can't be deleted yet",
  blockedDescription: "These depend on it. Change or remove them first.",
  dependsOnIt: (count) =>
    count === 1 ? "1 item depends on it:" : `${String(count)} items depend on it:`,
  andMore: (count) => `and ${String(count)} more`,
  dependentsFailed: "What depends on it could not be checked",
  loading: "Loading",
  modalFailed: "This could not be opened",
  allDone: "All done",
  restrictedHeading: "Nothing to show you",
  askAnAdmin: "Ask an admin for access.",
  askForAccess: (names) => `Ask ${names} for access.`,
  noMatchesHeading: "No matches",
  noMatchesDescription: "Nothing matches these filters. Clear them to see everything.",
  nextSteps: "Next steps",
  statusHeading: (kind) =>
    ({
      "not-found": "Nothing here",
      forbidden: "You can't open this page",
      gone: "This is gone",
      "signed-out": "Your session has ended",
      offline: "You're offline",
      unreachable: "Can't reach the server",
      failed: "This page failed to load",
    })[kind],
  statusDescription: (kind) =>
    ({
      "not-found": "The page does not exist, or you do not have access to it.",
      forbidden: "Your account does not have access to it. Ask an admin if you need it.",
      gone: "It was deleted or moved, and is no longer here.",
      "signed-out": "Sign in again to carry on where you were.",
      offline: "Check your connection. The page loads once it is back.",
      unreachable: "It may be restarting. Try again in a moment.",
      failed: "Something went wrong while showing this page.",
    })[kind],
  goHome: "Go home",
  goBack: "Go back",
  errorDetails: "Details",
  none: "None",
  notSet: "Not set",
  noLimit: "No limit",
  nobody: "Nobody yet",
  notRecorded: "Not recorded",
  notApplicable: "Not applicable",
  timeLeft: (duration) => `${duration} left`,
  timeUp: "Time is up",
  sessionEndsIn: (time) => `Your session ends in ${time}`,
  sessionIdle: "Nothing is using it. Keep it alive to carry on.",
  sessionLimit: "It has reached its time limit. Extend it to carry on.",
  keepAlive: "Keep alive",
  extendSession: "Extend",
  sessionEnded: "Your session has ended",
  restoreNamed: (name) => `Restore ${name}`,
  archivedOn: (by, date) =>
    by === undefined ? `Archived on ${date}.` : `Archived by ${by} on ${date}.`,
  deletedOn: (by, date) =>
    by === undefined ? `Deleted on ${date}.` : `Deleted by ${by} on ${date}.`,
  archivedHint: "Its history stays; nothing in it runs or changes.",
  deletedHint: "It does nothing while deleted. Restore it to use it again.",
  purgedIn: (time) => `It is removed for good ${time}.`,
  reviewStage: "Review state",
  stageName: (stage) =>
    ({ none: "Not started", draft: "Draft", review: "In review", completed: "Completed" })[stage],
  startDocument: "Start",
  documentLocked:
    "Completed, so it cannot be changed. Set it back to draft or in review to edit it.",
  publish: "Publish",
  saveBeforePublishing: "Save the changes before publishing.",
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
  chooseTableSize: "Table size",
  imageDetails: "Alt text and caption",
  altText: "Alt text",
  altTextHint: "What the picture shows, for someone who cannot see it",
  blockPlaceholder: "Write, or press / for blocks",
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
  layoutBlocks: "Layout",
  callout: "Callout",
  calloutTone: "Tone",
  calloutToneName: (tone) =>
    ({
      neutral: "Neutral",
      info: "Information",
      success: "Success",
      warning: "Warning",
      danger: "Danger",
    })[tone],
  twoColumns: "2 columns",
  threeColumns: "3 columns",
  columnLayout: "Columns",
  columnLayoutName: (shares) => shares.join(" : "),
  toggle: "Toggle",
  toggleTitle: "Toggle heading",
  toggleExpanded: "Expanded",
  toggleCollapsed: "Collapsed",
  panelLayout: "Show as",
  panelLayoutName: (layout) =>
    ({
      tabs: "Tabs",
      steps: "Steps",
      timeline: "Timeline",
      cards: "Flip cards",
      choices: "Choices",
    })[layout],
  panelLayoutHint: (layout) =>
    ({
      tabs: "Parts a reader opens one at a time",
      steps: "A process, step by numbered step",
      timeline: "Events in the order they happened",
      cards: "Cards a reader turns over, a title on the front",
      choices: "Paths a reader chooses between",
    })[layout],
  panelTitle: (layout) =>
    ({
      tabs: "Tab name",
      steps: "Step",
      timeline: "Date or event",
      cards: "Front of the card",
      choices: "A choice the reader can make",
    })[layout],
  addPanel: (layout) =>
    ({
      tabs: "Add a tab",
      steps: "Add a step",
      timeline: "Add an event",
      cards: "Add a card",
      choices: "Add a choice",
    })[layout],
  turnCardOver: "Turn over",
  turnCardBack: "Turn back",
  chooseAgain: "Choose again",
  chosenPath: "What happens next",
  sharedBlock: "Shared block",
  sharedBlockHint: "A block kept once and shown wherever it is used",
  editSharedBlock: "Edit everywhere",
  copySharedBlockHere: "Copy here",
  keepAsSharedBlock: "Keep as a shared block",
  pageBreak: "Page break",
  footnote: "Footnote",
  footnotes: "Footnotes",
  addFootnote: "Add a footnote",
  footnoteHint: "What the note says",
  removeFootnote: "Remove footnote",
  footnoteReference: (number) => `Footnote ${number}`,
  backToReference: (number) => `Back to footnote ${number} in the text`,
  findAndReplace: "Find and replace",
  findText: "Find",
  replaceWith: "Replace with",
  previousMatch: "Previous match",
  nextMatch: "Next match",
  matchCase: "Match case",
  wholeWords: "Whole words",
  matchCount: (current, total) => `${String(current)} of ${String(total)}`,
  replaceOne: "Replace",
  replaceAll: "Replace all",
  wordCount: (count) => (count === 1 ? "1 word" : `${String(count)} words`),
  readingTime: (minutes) => `${String(minutes)} min read`,
  outline: "Outline",
  outlineEmpty: "No headings yet",
  focusMode: "Focus mode",
  leaveFocusMode: "Leave focus mode",
  wordDocument: "Word document",
  readingWordDocument: "Reading the Word document…",
  wordDocumentRead: "Imported",
  wordPicturesSkipped: (count) =>
    count === 1
      ? "Imported; 1 picture was left out"
      : `Imported; ${String(count)} pictures were left out`,
  wordDocumentFailed: "The Word document could not be read",
  textTracks: "Captions, description and transcript",
  audioDescription: "Audio description",
  captionsHint: "Each line shows from its start to its end. A new line starts where the player is.",
  addCaptionLine: "Add a line",
  captionStart: (line) => `Start of line ${String(line)}`,
  captionEnd: (line) => `End of line ${String(line)}`,
  captionText: (line) => `Words of line ${String(line)}`,
  removeCaptionLine: (line) => `Remove line ${String(line)}`,
  captionsLanguage: "Language",
  captionsEmpty: "No lines yet. Play the recording and add a line where the words start.",
  uploadCaptions: "Upload WebVTT",
  saveCaptions: "Save captions",
  captionsTimeProblem: "Each line needs a start and an end, the end after the start",
  captionsSaveFailed: "The captions could not be saved",
  draftCaptions: "Draft from speech",
  draftWaiting: "Waiting to draft…",
  drafting: (percent) => `Drafting… ${String(percent)}%`,
  useDraft: "Use the draft",
  draftNote: "A draft from speech: check each line against the recording before saving.",
  draftFailed: "The draft could not be made",
  descriptionsHelp: "Each line is a time and what the picture shows from then.",
  descriptionAddAt: (time) => `Add at ${time}`,
  descriptionsHint: "0:05 A map of the river appears",
  descriptionsSkipped: (count) =>
    count === 1
      ? "1 line has no time and is left out"
      : `${String(count)} lines have no time and are left out`,
  transcriptHint: "Everything the recording says, written out",
  imageSize: "Size",
  imageSizeName: (size) =>
    ({ small: "Small", medium: "Medium", large: "Large", full: "Full width" })[size],
  imageDecorative: "Decorative only: screen readers skip it",
  imageAltMissing: "Add alt text, or mark the picture decorative",
  imageCredit: "Credit",
  imageCreditAuthor: "Made by",
  imageCreditLicence: "Licence",
  imageCreditSource: "Page it came from",
  imageCreditAllRights: "All rights reserved",
  imageCreditPublicDomain: "Public domain",
  imageFocus: "Focus point",
  imageFocusHint:
    "Press on what matters, or move the dot with the arrow keys; a crop keeps it in view",
  imageFocusAt: (x, y) => `Focus point, ${String(x)}% across and ${String(y)}% down`,
  pictureLabels: "Labels",
  addPictureLabel: "Add label",
  pictureLabel: (number) => `Label ${number}`,
  movePictureLabel: (number) => `Move label ${number}`,
  pictureLabelTitle: (number) => `Label ${number} name`,
  pictureLabelTitlePlaceholder: "What is here",
  pictureLabelText: (number) => `Label ${number} description`,
  pictureLabelTextPlaceholder: "More about it",
  removePictureLabel: (number) => `Remove label ${number}`,
  gallery: "Gallery",
  galleryAdd: "Add pictures",
  galleryEmpty: "No pictures yet",
  editGallery: "Edit gallery",
  galleryOrderHint: "Drag a picture to a new place, or press Alt with an arrow key",
  pictureOf: (number, total) => `Picture ${number} of ${total}`,
  pictureEarlier: "Earlier",
  pictureLater: "Later",
  removePicture: "Remove picture",
  pictureAltMissing: "No alt text yet",
  compareBefore: "Before",
  compareAfter: "After",
  compareSlider: "Slide between before and after",
  compareShown: (before, percent) => `${before} ${String(percent)}%`,
  compareChoose: (side) => `Choose the ${side.toLowerCase()} picture`,
  editComparison: "Edit comparison",
  fileBlock: "File",
  fileCaption: "Caption",
  fileNoPreview: "This file cannot be shown here.",
  openFile: (name) => `Open ${name}`,
  viewFile: "View",
  copyFileLink: "Copy link",
  newFileVersion: "Upload a new version",
  fileDisplay: "Show as",
  fileShowCard: "A card",
  fileShowPages: "A card and its pages",
  cut: "Cut",
  paste: "Paste",
  pasteAsText: "Paste as plain text",
  superscript: "Superscript",
  subscript: "Subscript",
  textColour: "Text colour",
  highlight: "Highlight",
  defaultColour: "Default",
  colourName: (colour) =>
    ({
      gray: "Grey",
      brown: "Brown",
      orange: "Orange",
      yellow: "Yellow",
      green: "Green",
      blue: "Blue",
      purple: "Purple",
      pink: "Pink",
      red: "Red",
    })[colour],
  textSize: "Text size",
  textSizeName: (size) =>
    ({ small: "Small", normal: "Normal", large: "Large", huge: "Huge" })[size],
  clearFormatting: "Clear formatting",
  documentInvalid: "This document cannot be saved as it is",
  markdown: "Markdown",
  markdownHint: "The document as Markdown: copy it out, or change it and replace the document.",
  replaceFromMarkdown: "Replace the document",
  blockToolbar: "Block",
  blockGroups: "Groups",
  tableRow: (row) => `Row ${String(row)}`,
  tableColumn: (column) => `Column ${String(column)}`,
  dragTableLine: "Drag to move, or press for actions",
  moveRowUp: "Move row up",
  moveRowDown: "Move row down",
  moveColumnBefore: "Move column before",
  moveColumnAfter: "Move column after",
  headerColumn: "Header column",
  mergeCells: "Merge cells",
  splitCell: "Split cell",
  cellColour: "Cell colour",
  cellAlignment: "Text alignment",
  verticalAlignment: "Vertical alignment",
  alignTop: "Top",
  alignMiddle: "Middle",
  alignBottom: "Bottom",
  stripedRows: "Striped rows",
  lineAbove: "Add a line above",
  lineBelow: "Add a line below",
  tableMoved: (kind, position, total) =>
    `${kind === "row" ? "Row" : "Column"} moved to ${String(position)} of ${String(total)}`,
  codeLanguage: "Language",
  plainText: "Plain text",
  identifierUpperSnake:
    "Capital letters, digits and underscores; anything else becomes an underscore.",
  identifierSnake:
    "Lowercase letters, digits and underscores; anything else becomes an underscore.",
  identifierKebab: "Lowercase letters, digits and dashes; anything else becomes a dash.",
  identifierFilename:
    "Letters, digits, dots, dashes and underscores; anything else becomes a dash.",
  slugAt: (address) => `Its address is ${address}.`,
  change: "Change",
  slugChecking: "Checking the address…",
  slugFree: (slug) => `${slug} is free.`,
  slugTaken: (slug) => `${slug} is taken. Try another.`,
  slugCheckFailed: "Could not check the address. It is checked again when you save.",
  noSuggestions: "Nothing in use matches. What you type is used as it is.",
  couldNotSave: "Could not save. Try again.",
  noneChosen: "None chosen",
  pickAtLeastOne: "Pick at least one.",
  search: "Search",
  add: "Add",
  hiddenOptions: (count) =>
    count === 1 ? "Also 1 more you cannot see." : `Also ${String(count)} more you cannot see.`,
  fillBothOrNeither: "Fill in both, or leave both empty.",
  lowContrast: (against, ratio, minimum) =>
    `Against ${against} this reads at ${ratio}:1, under the ${minimum}:1 text needs.`,
  holdsAnError: "Holds an error",
  rowOf: (position) => `Row ${String(position)}`,
  rowAdded: (row) => `${row} added`,
  rowRemoved: (row) => `${row} removed`,
  rowMoved: (row, position, total) => `${row} moved to ${String(position)} of ${String(total)}`,
  moveRowUpOf: (row) => `Move ${row} up`,
  moveRowDownOf: (row) => `Move ${row} down`,
  removeRowOf: (row) => `Remove ${row}`,
  editRecordOf: (record) => `Edit ${record}`,
  addRecord: "Add",
  records: "Records",
  addressCountry: "Country or region",
  addressLine1: "Street address",
  addressLine2: "Apartment, suite or building",
  addressCity: "City",
  addressRegion: (kind) =>
    (
      {
        state: "State",
        province: "Province",
        county: "County",
        prefecture: "Prefecture",
        emirate: "Emirate",
        governorate: "Governorate",
      } as Readonly<Record<string, string>>
    )[kind] ?? "Region",
  addressPostal: (kind) =>
    (
      { zip: "ZIP code", postcode: "Postcode", pin: "PIN code" } as Readonly<Record<string, string>>
    )[kind] ?? "Postal code",
  uploadsPending: "Wait for the files to finish uploading.",
  attachedFiles: "Attached files",
  showValue: "Show the value",
  hideValue: "Hide the value",
  severalLines: "Several lines, such as a private key or a certificate",
  typeSecret: "Type the secret.",
  typeSecretAgain: "Type it again. A stored secret goes only where it was given.",
  typeItAgain: "Type it again",
  storedSecretPlaceholder: "Stored. Leave blank to keep it.",
  storedSecretEnding: (hint) => `Stored, ending in ${hint}. Leave blank to keep it.`,
  storedSecretMoved:
    "Where it is sent has changed, and a stored secret goes only where it was given: type it again.",
  storedSecretSince: (hint, since) => `One ending in ${hint} has been in use since ${since}.`,
  storedSecretKept:
    "It is stored and never shown. Leave this blank to keep it, or type a new one to replace it.",
  forgottenOnSave: "It is forgotten once you save.",
  keepIt: "Keep it",
  forgetIt: "Forget it",
  chooseSecret: "Choose a secret",
  secretNotFound: (name) => `No stored secret is named ${name}.`,
  missingSecret: (name) => `${name} (not found)`,
  notASecretReference: "Not a reference to a stored secret",
  copyOf: (name) => `Copy ${name}`,
  chooseAFile: "Choose a file",
  orPasteIt: "Or paste it above, or drop a file on it.",
  readFromFile: (name, size) => `Read from ${name}, ${size}`,
  hiddenValue: "Hidden",
  showNamed: (name) => `Show ${name}`,
  hideNamed: (name) => `Hide ${name}`,
  couldNotReveal: "Could not show it. Try again.",
  newSecretHeading: "Copy your new secret",
  shownOnce: "Copy it now. It is not shown again.",
  copySecret: "Copy the secret",
  worksUntil: (moment) => `It works until ${moment}.`,
  storedItSafely: "I have stored it somewhere safe",
  secretWord: "Secret",
  redacted: "redacted",
  scopeOutsideRole: "Your role here does not include this.",
  credentialCapture: "Save the captured value",
  credentialExisting: "Use a stored secret",
  credentialNew: "Type a value",
  credentialSourceOf: (name) => `Where ${name} comes from`,
  credentialSecretOf: (name) => `The secret ${name} reads`,
  credentialValueOf: (name) => `The value of ${name}`,
  credentialScopeOf: (name) => `Where ${name} is saved`,
  chooseSecretFor: (name) => `Choose the secret ${name} reads.`,
  typeValueOf: (name) => `Type the value of ${name}.`,
  credentialsUnbound: "Choose where each secret comes from.",
  everywhere: "Everywhere",
  onlyIn: (scope) => `${scope} only`,
  readsSecret: (secret) => `Reads ${secret}`,
  credentialCaptured: "Saved from what was captured",
  credentialTyped: "Typed here",
  sessions: "Sessions",
  sessionClient: "Signed in on",
  sessionWhere: "Where",
  sessionActive: "Last active",
  thisDevice: "This device",
  unknownPlace: "Unknown",
  noSessions: "Not signed in anywhere",
  signOut: "Sign out",
  signedOut: "Signed out",
  signOutOthers: "Sign out everywhere else",
  signOutOthersHeading: "Sign out everywhere else?",
  signOutOthersDescription: (count) =>
    count === 1
      ? "The other session ends at once, and whoever is using it signs in again."
      : `The ${String(count)} other sessions end at once, and whoever is using them signs in again.`,
  connectedApps: "Connected applications",
  noConnectedApps: "No applications connected",
  appColumn: "Application",
  appState: "Status",
  appConnected: "Connected",
  appBlocked: "Blocked",
  connectedBy: "Connected by",
  appAccess: "Access",
  scopesOf: (name) => `What ${name} may do`,
  lastUsed: "Last used",
  connectedAt: "Connected",
  disconnect: "Disconnect",
  disconnectHeading: (name) => `Disconnect ${name}?`,
  disconnectDescription: "It stops working at once, and has to ask again to reconnect.",
  appsMayConnect: "Applications may connect",
  connectAt: "Connect at",
  copyAddress: "Copy the address",
  apiKeys: "API keys",
  noApiKeys: "No API keys yet",
  noApiKeysDescription:
    "A key lets a script, a CI job or an agent call the API with what you give it.",
  keyName: "Name",
  keyColumn: "Key",
  keyCount: (count) => (count === 1 ? "1 key" : `${String(count)} keys`),
  everyScope: "Every scope",
  scopes: "Scopes",
  expired: "Expired",
  createKey: "Create key",
  createKeyHeading: "Create an API key",
  createKeyDescription: "It acts with what you give it until it expires or you revoke it.",
  copyNewKey: "Copy your new key",
  copyTheKey: "Copy the key",
  defaultKeyName: "default",
  nameTheKey: "Name the key after what uses it.",
  expiresHint: "Make a new key before then: an expired key stops working.",
  neverExpiresHint: "It works until revoked. Prefer an expiry for a key kept in CI.",
  revokeKey: "Revoke key",
  revokeKeyHeading: (name) => `Revoke ${name}?`,
  revokeKeyDescription: "Anything using it stops working at once.",
  testConnection: "Test the connection",
  test: "Test",
  probeHint: "Optional: something to read as well as connecting.",
  testingConnection: "Testing…",
  connectionWorked: "It worked.",
  connectionFailed: "It failed.",
  connectionTestFailed: "Could not run the test. Try again.",
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
