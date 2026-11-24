import type { Demos } from "../../gallery/types.ts";
import CommentComposer from "./comment-composer.tsx";
import commentComposer from "./comment-composer.tsx?raw";
import CommentThreads from "./comment-threads.tsx";
import commentThreads from "./comment-threads.tsx?raw";
import DockedPanels from "./docked-panels.tsx";
import dockedPanels from "./docked-panels.tsx?raw";
import EntityPicker from "./entity-picker.tsx";
import entityPicker from "./entity-picker.tsx?raw";
import ImageField from "./image-field.tsx";
import imageField from "./image-field.tsx?raw";
import RemoteSearch from "./remote-search.tsx";
import remoteSearch from "./remote-search.tsx?raw";
import VersionHistory from "./version-history.tsx";
import versionHistory from "./version-history.tsx?raw";
import ViewSwitcher from "./view-switcher.tsx";
import viewSwitcher from "./view-switcher.tsx?raw";

export const demos: Demos = {
  "comment-threads": { component: CommentThreads, code: commentThreads },
  "comment-composer": { component: CommentComposer, code: commentComposer },
  "version-history": { component: VersionHistory, code: versionHistory },
  "entity-picker": { component: EntityPicker, code: entityPicker },
  "remote-search": { component: RemoteSearch, code: remoteSearch },
  "image-field": { component: ImageField, code: imageField },
  "view-switcher": { component: ViewSwitcher, code: viewSwitcher },
  "docked-panels": { component: DockedPanels, code: dockedPanels },
};
