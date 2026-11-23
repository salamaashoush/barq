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

export type Collaborator = Readonly<{
  pointer?: CollaboratorPointer;
  button?: "up" | "down";
  selectedElementIds?: AppState["selectedElementIds"];
  username?: string | null;
  userState?: UserIdleState;
  color?: {
    background: string;
    stroke: string;
  };
  /** The collaborator's avatar; their initials when absent. */
  avatarUrl?: string;
  /** Stable across a user's clients, where `socketId` is one per client. */
  id?: string;
  socketId?: SocketId;
  isCurrentUser?: boolean;
  isInCall?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
}>;

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

export type StaticCanvasAppState = Readonly<
  CommonCanvasAppState & {
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
>;

export type InteractiveCanvasAppState = Readonly<
  CommonCanvasAppState & {
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

/**
 * Excalidraw's whole application state, key for key, so a `.excalidraw` file
 * and a live editor's state carry the same names. Fields Excalidraw types as
 * React nodes (`errorMessage`, `toast.message`) and its context menu entries
 * are `unknown` here: the scene never reads them.
 */
export interface AppState {
  contextMenu: {
    items: readonly unknown[];
    top: number;
    left: number;
  } | null;
  showWelcomeScreen: boolean;
  isLoading: boolean;
  errorMessage: unknown;
  activeEmbeddable: {
    element: NonDeletedExcalidrawElement;
    state: "hover" | "active";
  } | null;
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
  suggestedBinding: {
    element: NonDeleted<ExcalidrawBindableElement>;
    midPoint?: GlobalPoint;
  } | null;
  textToolHover:
    | { type: "text"; elementId: ExcalidrawElement["id"] }
    | { type: "container"; elementId: ExcalidrawElement["id"] }
    | {
        type: "arrow";
        elementId: ExcalidrawArrowElement["id"];
        anchor: "start" | "end" | "label";
      }
    | null;
  frameToHighlight: NonDeleted<ExcalidrawFrameLikeElement> | null;
  frameRendering: {
    enabled: boolean;
    name: boolean;
    outline: boolean;
    clip: boolean;
  };
  editingFrame: ExcalidrawFrameLikeElement["id"] | null;
  elementsToHighlight: readonly NonDeletedExcalidrawElement[] | null;
  editingTextElement: ExcalidrawTextElement | null;
  activeTool: {
    lastActiveTool: ActiveTool | null;
    locked: boolean;
    fromSelection: boolean;
  } & ActiveTool;
  preferredSelectionTool: {
    type: "selection" | "lasso";
    initialized: boolean;
  };
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
    | null;
  openSidebar: { name: SidebarName; tab?: SidebarTabName } | null;
  openDialog: OpenDialog;
  defaultSidebarDockedPreference: boolean;
  lastPointerDownWith: PointerType;
  selectedElementIds: Readonly<{ [id: string]: true }>;
  hoveredElementIds: Readonly<{ [id: string]: true }>;
  previousSelectedElementIds: { [id: string]: true };
  selectedElementsAreBeingDragged: boolean;
  shouldCacheIgnoreZoom: boolean;
  toast: {
    message: unknown;
    closable?: boolean;
    duration?: number;
  } | null;
  zenModeEnabled: boolean;
  minimapEnabled: boolean;
  theme: Theme;
  gridSize: number;
  gridStep: number;
  gridModeEnabled: boolean;
  viewModeEnabled: boolean;
  /** Top-most selected groups, nested groups excluded. */
  selectedGroupIds: { [groupId: string]: boolean };
  editingGroupId: GroupId | null;
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  fileHandle: FileSystemFileHandle | null;
  collaborators: Map<SocketId, Collaborator>;
  stats: {
    open: boolean;
    panels: number;
  };
  showHyperlinkPopup: false | "info" | "editor";
  selectedLinearElement: LinearElementEditor | null;
  snapLines: readonly SnapLine[];
  originSnapOffset: {
    x: number;
    y: number;
  } | null;
  objectsSnapModeEnabled: boolean;
  isCropping: boolean;
  croppingElementId: ExcalidrawElement["id"] | null;
  searchMatches: Readonly<{
    focusedId: ExcalidrawElement["id"] | null;
    matches: readonly SearchMatch[];
  }> | null;
  activeLockedId: string | null;
  lockedMultiSelections: { [groupId: string]: true };
  bindMode: BindMode;
  colorTopPicks: {
    elementStroke: readonly string[] | null;
    elementBackground: readonly string[] | null;
    bucketFill: readonly string[] | null;
    stickyNoteStroke: readonly string[] | null;
    stickyNoteBackground: readonly string[] | null;
  };
  fontTopPicks: readonly FontFamilyValues[] | null;
}

export type SearchMatch = {
  id: string;
  focus: boolean;
  matchedLines: {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    showOnCanvas: boolean;
  }[];
};

export type NormalizedZoomValue = number & { _brand: "normalizedZoom" };

export type Zoom = Readonly<{
  value: NormalizedZoomValue;
}>;

export type PointerCoords = Readonly<{
  x: number;
  y: number;
}>;

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

/** What a render may change about an element: never its geometry, content, bindings or style. */
export type ElementRenderOverride = Readonly<{
  /** Absolute opacity, 0 to 100. */
  opacity?: number;
  /** Translation in scene units. A bound label follows its container's. */
  offset?: Readonly<{ x: number; y: number }>;
}>;

export type ElementRenderOverrides = ReadonlyMap<ExcalidrawElement["id"], ElementRenderOverride>;

/** The translation part of a set of overrides: only the entries that carry an offset. */
export type ElementRenderOffsets = ReadonlyMap<
  ExcalidrawElement["id"],
  NonNullable<ElementRenderOverride["offset"]>
>;

export type ImageCache = Map<
  FileId,
  {
    image: HTMLImageElement | Promise<HTMLImageElement>;
    mimeType: ValueOf<typeof IMAGE_MIME_TYPES>;
  }
>;

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

export type Offsets = Partial<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export type { EditorInterface };
