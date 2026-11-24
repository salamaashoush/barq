import type {
  EditorInterface,
  IMAGE_MIME_TYPES,
  MIME_TYPES,
  StrokeWidthKey,
  UserIdleState,
} from "@excalidraw/common";
import type { MakeBrand, ValueOf } from "@excalidraw/common/utility-types";
import type { LinearElementEditor } from "@excalidraw/element";
import type {
  Arrowhead,
  BindMode,
  ExcalidrawArrowElement,
  ExcalidrawBindableElement,
  ExcalidrawElement,
  ExcalidrawElementType,
  ExcalidrawFrameLikeElement,
  ExcalidrawIframeLikeElement,
  ExcalidrawLinearElement,
  ExcalidrawNonSelectionElement,
  ExcalidrawTextElement,
  FileId,
  FontFamilyValues,
  GroupId,
  NonDeleted,
  NonDeletedExcalidrawElement,
  PointerType,
  StrokeRoundness,
  StrokeVariability,
  TextAlign,
  Theme,
} from "@excalidraw/element/types";
import type { GlobalPoint } from "@excalidraw/math";

export type SocketId = string & { _brand: "SocketId" };

export interface CollaboratorInfo {
  pointer?: CollaboratorPointer;
  button?: "up" | "down";
  selectedElementIds?: AppState["selectedElementIds"];
  username?: string | null;
  userState?: UserIdleState;
  color?: CollaboratorColor;
  /** The collaborator's avatar; their initials when absent. */
  avatarUrl?: string;
  /** Stable across a user's clients, where `socketId` is one per client. */
  id?: string;
  socketId?: SocketId;
  isCurrentUser?: boolean;
  isInCall?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

export interface CollaboratorColor {
  background: string;
  stroke: string;
}

export type Collaborator = Readonly<CollaboratorInfo>;

export type CollaboratorPointer = {
  x: number;
  y: number;
  tool: "pointer" | "laser";
  /** @default true */
  renderCursor?: boolean;
  /** @default the collaborator's cursor color */
  laserColor?: string;
};

export type DataURL = string & { _brand: "DataURL" };

export type BinaryFileData = {
  mimeType: ValueOf<typeof IMAGE_MIME_TYPES> | typeof MIME_TYPES.binary;
  id: FileId;
  dataURL: DataURL;
  /** Epoch milliseconds. */
  created: number;
  /** When the file was last loaded onto a scene, in epoch milliseconds; storage uses it to drop unused files. */
  lastRetrieved?: number;
  /** Bumped when `dataURL` changes, e.g. by a schema migration on restore. */
  version?: number;
};

export type BinaryFileMetadata = Omit<BinaryFileData, "dataURL">;

export type BinaryFiles = Record<ExcalidrawElement["id"], BinaryFileData>;

export type ToolType =
  | "selection"
  | "lasso"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "hand"
  | "frame"
  | "magicframe"
  | "stickynote"
  | "embeddable"
  | "laser"
  | "autoshape"
  | "bucketfill";

export type ElementOrToolType = ExcalidrawElementType | ToolType | "custom";

export type ActiveTool =
  | {
      type: ToolType;
      customType: null;
    }
  | {
      type: "custom";
      customType: string;
    };

export type SidebarName = string;
export type SidebarTabName = string;

export type UserToFollow = {
  socketId: SocketId;
  username: string;
};

export type OnUserFollowedPayload = {
  userToFollow: UserToFollow;
  action: "FOLLOW" | "UNFOLLOW";
};

export interface PointerPosition {
  x: number;
  y: number;
  tool: "pointer" | "laser";
}

export interface Coords {
  x: number;
  y: number;
}

/** What `onPointerUpdate` hands over: the pointer in scene coordinates, and the pointers down. */
export type PointerUpdatePayload = {
  pointer: PointerPosition;
  button: "down" | "up";
  pointersMap: ReadonlyMap<number, Readonly<Coords>>;
};

type CommonCanvasAppState = {
  zoom: AppState["zoom"];
  scrollX: AppState["scrollX"];
  scrollY: AppState["scrollY"];
  width: AppState["width"];
  height: AppState["height"];
  viewModeEnabled: AppState["viewModeEnabled"];
  openDialog: AppState["openDialog"];
  editingGroupId: AppState["editingGroupId"];
  selectedElementIds: AppState["selectedElementIds"];
  frameToHighlight: AppState["frameToHighlight"];
  offsetLeft: AppState["offsetLeft"];
  offsetTop: AppState["offsetTop"];
  theme: AppState["theme"];
};

export interface StaticCanvasAppStateFields {
  shouldCacheIgnoreZoom: AppState["shouldCacheIgnoreZoom"];
  /** `null` is a transparent background. */
  viewBackgroundColor: AppState["viewBackgroundColor"] | null;
  exportScale: AppState["exportScale"];
  selectedElementsAreBeingDragged: AppState["selectedElementsAreBeingDragged"];
  gridSize: AppState["gridSize"];
  gridStep: AppState["gridStep"];
  frameRendering: AppState["frameRendering"];
  currentHoveredFontFamily: AppState["currentHoveredFontFamily"];
  hoveredElementIds: AppState["hoveredElementIds"];
  suggestedBinding: AppState["suggestedBinding"];
  croppingElementId: AppState["croppingElementId"];
}

export type StaticCanvasAppState = Readonly<CommonCanvasAppState & StaticCanvasAppStateFields>;

export interface InteractiveCanvasAppStateFields {
  activeTool: AppState["activeTool"];
  activeEmbeddable: AppState["activeEmbeddable"];
  selectionElement: AppState["selectionElement"];
  selectedGroupIds: AppState["selectedGroupIds"];
  selectedLinearElement: AppState["selectedLinearElement"];
  multiElement: AppState["multiElement"];
  newElement: AppState["newElement"];
  isBindingEnabled: AppState["isBindingEnabled"];
  isMidpointSnappingEnabled: AppState["isMidpointSnappingEnabled"];
  gridModeEnabled: AppState["gridModeEnabled"];
  suggestedBinding: AppState["suggestedBinding"];
  textToolHover: AppState["textToolHover"];
  isRotating: AppState["isRotating"];
  elementsToHighlight: AppState["elementsToHighlight"];
  collaborators: AppState["collaborators"];
  snapLines: AppState["snapLines"];
  zenModeEnabled: AppState["zenModeEnabled"];
  editingTextElement: AppState["editingTextElement"];
  isCropping: AppState["isCropping"];
  croppingElementId: AppState["croppingElementId"];
  searchMatches: AppState["searchMatches"];
  activeLockedId: AppState["activeLockedId"];
  hoveredElementIds: AppState["hoveredElementIds"];
  frameRendering: AppState["frameRendering"];
  shouldCacheIgnoreZoom: AppState["shouldCacheIgnoreZoom"];
  exportScale: AppState["exportScale"];
  currentItemArrowType: AppState["currentItemArrowType"];
}

export type InteractiveCanvasAppState = Readonly<
  CommonCanvasAppState & InteractiveCanvasAppStateFields
>;

export type BoxSelectionMode = "contain" | "overlap";

/** The pointing device the wheel mappings are tuned for; `auto` resolves to `trackpad`. */
export type InputDevice = "auto" | "mouse" | "trackpad";

/** A box in scene coordinates that pan and zoom are held to. */
export type ScrollConstraints = {
  x: number;
  y: number;
  width: number;
  height: number;
  lockScroll: boolean;
  lockZoom: boolean;
  zoom: number;
  /** Screen pixels the viewport may overscroll before it snaps back. */
  overscroll: number;
  /** Extra scrollable margin around the box, in viewport pixels. */
  offsets?: Offsets;
};

type PointPair = [GlobalPoint, GlobalPoint];

export type PointSnapLine = {
  type: "points";
  points: GlobalPoint[];
};

export type PointerSnapLine = {
  type: "pointer";
  points: PointPair;
  direction: "horizontal" | "vertical";
};

export type GapSnapLine = {
  type: "gap";
  direction: "horizontal" | "vertical";
  points: PointPair;
};

export type SnapLine = PointSnapLine | GapSnapLine | PointerSnapLine;

/**
 * The editor's dialogs, by name. Excalidraw's chart dialog carries a parsed
 * spreadsheet; it is opaque here because nothing in this package reads it.
 */
export type OpenDialog =
  | null
  | { name: "imageExport" | "help" | "jsonExport" }
  | { name: "ttd"; tab: "text-to-diagram" | "mermaid" }
  | { name: "commandPalette" }
  | { name: "settings" }
  | { name: "elementLinkSelector"; sourceElementId: ExcalidrawElement["id"] }
  | { name: "charts"; data: unknown; rawText: string };

export interface ContextMenuState {
  items: readonly unknown[];
  top: number;
  left: number;
}

export interface ActiveEmbeddable {
  element: NonDeletedExcalidrawElement;
  state: "hover" | "active";
}

export interface SuggestedBinding {
  element: NonDeleted<ExcalidrawBindableElement>;
  midPoint?: GlobalPoint;
}

export interface TextHoverTarget {
  type: "text";
  elementId: ExcalidrawElement["id"];
}

export interface ContainerHoverTarget {
  type: "container";
  elementId: ExcalidrawElement["id"];
}

export interface ArrowHoverTarget {
  type: "arrow";
  elementId: ExcalidrawArrowElement["id"];
  anchor: "start" | "end" | "label";
}

export interface FrameRendering {
  enabled: boolean;
  name: boolean;
  outline: boolean;
  clip: boolean;
}

export interface ActiveToolFlags {
  lastActiveTool: ActiveTool | null;
  locked: boolean;
  fromSelection: boolean;
}

export interface PreferredSelectionTool {
  type: "selection" | "lasso";
  initialized: boolean;
}

export interface OpenSidebar {
  name: SidebarName;
  tab?: SidebarTabName;
}

export interface ElementIdSet {
  [id: string]: true;
}

export interface Toast {
  message: unknown;
  closable?: boolean;
  duration?: number;
  /** A save's progress, from 0 to 1, while the host's `onExport` holds it. */
  progress?: number | null;
}

export interface GroupIdSelection {
  [groupId: string]: boolean;
}

export interface StatsPanelState {
  open: boolean;
  panels: number;
}

export interface SearchMatches {
  focusedId: ExcalidrawElement["id"] | null;
  matches: readonly SearchMatch[];
}

export interface GroupIdSet {
  [groupId: string]: true;
}

export interface ColorTopPicks {
  elementStroke: readonly string[] | null;
  elementBackground: readonly string[] | null;
  bucketFill: readonly string[] | null;
  stickyNoteStroke: readonly string[] | null;
  stickyNoteBackground: readonly string[] | null;
}

/**
 * Excalidraw's whole application state, key for key, so a `.excalidraw` file
 * and a live editor's state carry the same names. Fields Excalidraw types as
 * React nodes (`errorMessage`, `toast.message`) and its context menu entries
 * are `unknown` here: the scene never reads them.
 */
export interface AppState {
  contextMenu: ContextMenuState | null;
  showWelcomeScreen: boolean;
  isLoading: boolean;
  errorMessage: unknown;
  activeEmbeddable: ActiveEmbeddable | null;
  newElement: NonDeleted<ExcalidrawNonSelectionElement> | null;
  resizingElement: NonDeletedExcalidrawElement | null;
  multiElement: NonDeleted<ExcalidrawLinearElement> | null;
  selectionElement: NonDeletedExcalidrawElement | null;
  isBindingEnabled: boolean;
  boxSelectionMode: BoxSelectionMode;
  bindingPreference: "enabled" | "disabled";
  isMidpointSnappingEnabled: boolean;
  showHints: boolean;
  inputDevice: InputDevice;
  suggestedBinding: SuggestedBinding | null;
  textToolHover: TextHoverTarget | ContainerHoverTarget | ArrowHoverTarget | null;
  frameToHighlight: NonDeleted<ExcalidrawFrameLikeElement> | null;
  frameRendering: FrameRendering;
  editingFrame: ExcalidrawFrameLikeElement["id"] | null;
  elementsToHighlight: readonly NonDeletedExcalidrawElement[] | null;
  editingTextElement: ExcalidrawTextElement | null;
  activeTool: ActiveToolFlags & ActiveTool;
  preferredSelectionTool: PreferredSelectionTool;
  penMode: boolean;
  penDetected: boolean;
  exportBackground: boolean;
  exportEmbedScene: boolean;
  exportWithDarkMode: boolean;
  exportScale: number;
  currentItemStrokeColor: string;
  currentItemStickynoteStrokeColor: string;
  currentItemStickynoteBackgroundColor: string;
  currentItemBackgroundColor: string;
  currentItemFillStyle: ExcalidrawElement["fillStyle"];
  currentItemStrokeWidthKey: StrokeWidthKey;
  currentItemStrokeStyle: ExcalidrawElement["strokeStyle"];
  currentItemRoughness: number;
  currentItemStrokeVariability: StrokeVariability;
  currentItemOpacity: number;
  currentItemFontFamily: FontFamilyValues;
  currentItemFontSize: number;
  currentItemTextAlign: TextAlign;
  currentItemStartArrowhead: Arrowhead | null;
  currentItemEndArrowhead: Arrowhead | null;
  currentHoveredFontFamily: FontFamilyValues | null;
  currentItemRoundness: StrokeRoundness;
  currentItemArrowType: "sharp" | "round" | "elbow";
  viewBackgroundColor: string;
  scrollX: number;
  scrollY: number;
  scrollConstraints: ScrollConstraints | null;
  cursorButton: "up" | "down";
  scrolledOutside: boolean;
  name: string | null;
  isResizing: boolean;
  isRotating: boolean;
  zoom: Zoom;
  openMenu: "canvas" | null;
  openPopup:
    | "canvasBackground"
    | "elementBackground"
    | "elementStroke"
    | "fontFamily"
    | "compactTextProperties"
    | "compactStrokeStyles"
    | "compactOtherProperties"
    | "compactArrowProperties"
    | "convertElementType"
    | null;
  openSidebar: OpenSidebar | null;
  openDialog: OpenDialog;
  defaultSidebarDockedPreference: boolean;
  lastPointerDownWith: PointerType;
  selectedElementIds: Readonly<ElementIdSet>;
  hoveredElementIds: Readonly<ElementIdSet>;
  previousSelectedElementIds: ElementIdSet;
  selectedElementsAreBeingDragged: boolean;
  shouldCacheIgnoreZoom: boolean;
  toast: Toast | null;
  zenModeEnabled: boolean;
  minimapEnabled: boolean;
  theme: Theme;
  gridSize: number;
  gridStep: number;
  gridModeEnabled: boolean;
  viewModeEnabled: boolean;
  /** Top-most selected groups, nested groups excluded. */
  selectedGroupIds: GroupIdSelection;
  editingGroupId: GroupId | null;
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  fileHandle: FileSystemFileHandle | null;
  collaborators: Map<SocketId, Collaborator>;
  stats: StatsPanelState;
  showHyperlinkPopup: false | "info" | "editor";
  selectedLinearElement: LinearElementEditor | null;
  snapLines: readonly SnapLine[];
  originSnapOffset: Coords | null;
  objectsSnapModeEnabled: boolean;
  isCropping: boolean;
  croppingElementId: ExcalidrawElement["id"] | null;
  searchMatches: Readonly<SearchMatches> | null;
  activeLockedId: string | null;
  lockedMultiSelections: GroupIdSet;
  bindMode: BindMode;
  colorTopPicks: ColorTopPicks;
  fontTopPicks: readonly FontFamilyValues[] | null;
}

export interface MatchedLine {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  showOnCanvas: boolean;
}

export type SearchMatch = {
  id: string;
  focus: boolean;
  matchedLines: MatchedLine[];
};

export type NormalizedZoomValue = number & { _brand: "normalizedZoom" };

export interface ZoomLevel {
  value: NormalizedZoomValue;
}

export type Zoom = Readonly<ZoomLevel>;

export type PointerCoords = Readonly<Coords>;

/** A version 1 library item: the elements alone. */
export type LibraryItem_v1 = readonly NonDeleted<ExcalidrawElement>[];
type LibraryItems_v1 = readonly LibraryItem_v1[];

export type LibraryItem = {
  id: string;
  status: "published" | "unpublished";
  elements: readonly NonDeleted<ExcalidrawElement>[];
  /** Epoch milliseconds. */
  created: number;
  name?: string;
  error?: string;
};
export type LibraryItems = readonly LibraryItem[];
export type LibraryItems_anyVersion = LibraryItems | LibraryItems_v1;

export interface EnabledInteractions {
  /** Element links show their icon and open when clicked, as in view mode. */
  links?: boolean;
  /** Embeds activate on hover and click, as in view mode. */
  embeds?: boolean;
  /** `links` and `embeds` together. */
  interactiveContent?: boolean;
  /**
   * Panning and zooming (drag, wheel, pinch, the zoom keys), held to
   * `scrollConstraints`; the editor takes the wheel back from the page.
   */
  navigation?: boolean;
  /** The browser's own zoom over the editor, which is held back otherwise. */
  browserZoom?: boolean;
  /** Tools the pointer keeps driving while active; switching tools stays the host's. */
  tools?: EnabledTools;
}

export interface EnabledTools {
  /** The laser draws and `onPointerUpdate` keeps reporting. */
  laser?: boolean;
  /** A custom tool keeps `onPointerDown` and `onPointerUp` coming. */
  custom?: boolean;
}

/**
 * Excalidraw's `InteractionConfig`: what stays enabled while the editor is
 * otherwise not interactive. Anything omitted or `false` is off.
 */
export type InteractionConfig = {
  enabled?: EnabledInteractions;
};

export interface EnabledUI {
  /** Zoom out, the level (which resets it) and zoom in. */
  zoom?: boolean;
  /** The button shown once the viewport is away from every element. */
  scrollBackToContent?: boolean;
}

export interface DisabledUI {
  /** The minimap and every way to toggle it. */
  minimap?: boolean;
}

/**
 * Excalidraw's `UIConfig`: the default controls kept while the rest of the
 * default UI is hidden (`enabled`), or removed from it (`disabled`).
 */
export type UIConfig =
  | {
      enabled: EnabledUI;
    }
  | {
      disabled: DisabledUI;
    };

export type UIControl = "zoom" | "scrollBackToContent" | "minimap";

export interface ImageLimits {
  maxWidthOrHeight: number;
  maxFileSizeBytes: number;
}

/** Excalidraw's `ImageOptions`: how inserted images are kept small. */
export type ImageOptions = Partial<ImageLimits>;

/** A tool the host forces, Excalidraw's `activeTool` prop: any but the image tool. */
export type ForcedActiveTool =
  | { type: Exclude<ToolType, "image"> }
  | { type: "custom"; customType: string };

export interface ElementRenderOverrideFields {
  /** Absolute opacity, 0 to 100. */
  opacity?: number;
  /** Translation in scene units. A bound label follows its container's. */
  offset?: Readonly<Coords>;
}

/** What a render may change about an element: never its geometry, content, bindings or style. */
export type ElementRenderOverride = Readonly<ElementRenderOverrideFields>;

export type ElementRenderOverrides = ReadonlyMap<ExcalidrawElement["id"], ElementRenderOverride>;

/** The translation part of a set of overrides: only the entries that carry an offset. */
export type ElementRenderOffsets = ReadonlyMap<
  ExcalidrawElement["id"],
  NonNullable<ElementRenderOverride["offset"]>
>;

export interface CachedImage {
  image: HTMLImageElement | Promise<HTMLImageElement>;
  mimeType: ValueOf<typeof IMAGE_MIME_TYPES>;
}

export type ImageCache = Map<FileId, CachedImage>;

export type FrameNameBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type KeyboardModifiersObject = {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

export type EmbedsValidationStatus = Map<ExcalidrawIframeLikeElement["id"], boolean>;

export type ElementsPendingErasure = Set<ExcalidrawElement["id"]>;

export type PendingExcalidrawElements = NonDeletedExcalidrawElement[];

/** A grid size at run time; `null` is no grid. */
export type NullableGridSize = (AppState["gridSize"] & MakeBrand<"NullableGridSize">) | null;

export interface OffsetEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Offsets = Partial<OffsetEdges>;

/**
 * The `data-viewport-ui` of a UI surface over the canvas, which
 * `getViewportOffsets` measures: `top` and `bottom` by the edge facing the
 * canvas, `side` by the half of the viewport its centre is in.
 */
export type ViewportUIDock = "top" | "bottom" | "side";

/** The `data-viewport-ui-name` of a surface that comes and goes, measured on its own and reserved while hidden. */
export type ViewportUIName = "sidebar" | "stylesPanel" | "stats";

export interface ReservedPanels {
  stylesPanel?: boolean;
  sidebar?: boolean;
}

/**
 * How `getViewportOffsets` measures the UI. Unlike `Offsets`, the horizontal
 * sides are logical: `left` is the reading direction's start.
 */
export type ViewportOffsetsOptions = {
  /** Added to each measured side. @default 24 */
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  /** A side's final value in place of the measured UI, without padding. */
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  /**
   * Room kept for these surfaces while they are hidden, so the offsets do not
   * shift as they come and go: their last measured size, or an estimate.
   * Not on a phone, where they cover the canvas.
   */
  reserve?: ReservedPanels;
};

/**
 * The insets `setViewport` and `initialState.viewport` fit a target within:
 * static sides in screen pixels, the UI as rendered (`ui`), or both, a
 * static side winning over the measured one.
 */
export type ViewportOffsets = Offsets & {
  ui?: true | ViewportOffsetsOptions;
};

export type { EditorInterface };
