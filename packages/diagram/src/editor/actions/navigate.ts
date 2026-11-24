import { invariant } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import type { Collaborator } from "../../types.ts";
import type { Action } from "../types.ts";

/**
 * Follows a collaborator, or stops following the one followed: the request
 * goes to the host through `onUserFollow`, which owns `userToFollow`.
 */
export const actionGoToCollaborator: Action<Collaborator> = {
  name: "goToCollaborator",
  announcement: "",
  viewMode: true,
  perform: (_elements, appState, collaborator, app) => {
    invariant(
      collaborator,
      "actionGoToCollaborator: collaborator should be defined when actionGoToCollaborator is called",
    );
    if (
      !collaborator.socketId ||
      app.host.userToFollow?.socketId === collaborator.socketId ||
      collaborator.isCurrentUser
    ) {
      app.requestUnfollow();
      return { appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    app.emitUserFollowIntent({
      userToFollow: { socketId: collaborator.socketId, username: collaborator.username || "" },
      action: "FOLLOW",
    });
    return {
      // the phone's menu, which lists the collaborators, closes
      appState: {
        ...appState,
        openMenu: appState.openMenu === "canvas" ? null : appState.openMenu,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
};
