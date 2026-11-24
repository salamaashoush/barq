import { type Child, For, Show, createMemo, createSignal, onCleanup } from "@barqjs/core";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Eye } from "@barqjs/lucide/icons/eye";
import { Mic } from "@barqjs/lucide/icons/mic";
import { MicOff } from "@barqjs/lucide/icons/mic-off";
import { Avatar, AvatarFallback, AvatarImage } from "@barqjs/ui/avatar";
import { Button } from "@barqjs/ui/button";
import { Input } from "@barqjs/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { Tooltip, TooltipContent } from "@barqjs/ui/tooltip";
import { focus, layout, rounded, surface, type } from "@barqjs/arc/style";
import { keyframes } from "@barqjs/css";
import { COLOR_CHARCOAL_BLACK, COLOR_VOICE_CALL } from "@excalidraw/common";

import { getClientColor, getNameInitial } from "../clients.ts";
import { actionGoToCollaborator } from "../editor/actions/navigate.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { menuItem } from "./styles.ts";

import type { Collaborator, SocketId } from "../types.ts";

const SHOW_COLLABORATORS_FILTER_AT = 8;
const DEFAULT_MAX_AVATARS = 4;
// an avatar (32px) and the gap after it (6px)
const AVATAR_SLOT_WIDTH = 38;
// the current user's pill is wider than an avatar by its chevron and padding:
// carved out up front so that it never tips the row over
const PILL_EXTRA_WIDTH = 21;
// between the user list and the toolbar in the middle
const TOOLBAR_CLEARANCE = 8;

type ListedCollaborator = Collaborator & { socketId: SocketId };

// what the list shows: a cursor moving changes none of it
const SHOWN_KEYS = [
  "avatarUrl",
  "id",
  "socketId",
  "username",
  "isInCall",
  "isSpeaking",
  "isMuted",
  "isCurrentUser",
] as const;

const sameList = (a: readonly ListedCollaborator[], b: readonly ListedCollaborator[]): boolean =>
  a.length === b.length &&
  a.every((each, index) => {
    const other = b[index];
    return other !== undefined && SHOWN_KEYS.every((key) => each[key] === other[key]);
  });

const wrapper = d({
  display: "flex",
  flex: "1 1 auto",
  minWidth: "0",
  justifyContent: "flex-end",
  alignItems: "center",
  pointerEvents: "none",
});

const row = d({
  display: "flex",
  flexWrap: "nowrap",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "6px",
  padding: "4px",
  "& > *": { pointerEvents: "auto" },
});

const avatarButton = d(rounded.full, focus.visible, {
  position: "relative",
  display: "flex",
  flex: "0 0 auto",
  padding: "0",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  "&:active": { transform: "scale(0.94)" },
  "&[data-current-user]": { cursor: "auto" },
});

const avatar = d({
  fontWeight: "700",
  "[data-followed] > &, &[data-followed]": {
    boxShadow: "0 0 0 2px var(--background), 0 0 0 3px var(--brand, var(--primary))",
  },
});

const avatarInitial = d({ color: COLOR_CHARCOAL_BLACK });

const cornerStatus = d({
  position: "absolute",
  display: "flex",
  insetInlineEnd: "-4px",
  bottom: "-4px",
  "& svg": { width: "14px", height: "14px" },
});

const pill = d(rounded.full, focus.visible, layout.row, {
  gap: "0",
  height: "auto",
  padding: "0",
  paddingInlineEnd: "4px",
  border: "1px solid var(--border)",
  backgroundColor: "var(--muted)",
  color: "var(--muted-foreground)",
  cursor: "pointer",
  "&:hover": { backgroundColor: "var(--accent)" },
  "& > svg": { width: "15px", height: "15px" },
});

const menu = d(surface.elevated, layout.column, {
  width: "15rem",
  padding: "8px",
  gap: "4px",
});

const list = d(layout.column, {
  maxHeight: "50vh",
  overflowY: "auto",
  padding: "2px",
  gap: "2px",
});

const hint = d(type.meta, { padding: "4px 8px" });

const empty = d(type.meta, { padding: "8px", textAlign: "center" });

const collaboratorRow = d({
  width: "100%",
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  textAlign: "start",
  "&[data-current-user]": { pointerEvents: "none" },
});

const name = d(layout.fill, {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const statusIcons = d(layout.row, layout.pushEnd, {
  flex: "0 0 auto",
  minWidth: "2.25rem",
  gap: "4px",
  justifyContent: "flex-end",
  "& [data-muted]": { color: "var(--destructive)" },
});

const speakingPulse = keyframes`
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(2); }
`;

const speaking = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "1rem",
  height: "1rem",
  paddingInline: "3px",
  boxSizing: "border-box",
  "& > span": {
    width: "2px",
    height: "0.4rem",
    backgroundColor: COLOR_VOICE_CALL,
    animation: `${speakingPulse} 1s ease-in-out infinite`,
  },
  "& > span:nth-of-type(1)": { animationDelay: "-0.45s" },
  "& > span:nth-of-type(2)": { animationDelay: "-0.9s" },
  "& > span:nth-of-type(3)": { animationDelay: "-0.15s" },
});

const divider = d({ height: "1px", marginBlock: "4px", backgroundColor: "var(--border)" });

const mobileList = d(layout.column, { gap: "8px", marginBlock: "8px" });

const mobileAvatars = d({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px",
  "& > [data-current-user]": { order: "-1" },
});

/** The collaborator's picture, or their initial on their colour. */
function CollaboratorPicture(props: {
  socketId: SocketId;
  collaborator: Collaborator;
  size?: "default" | "sm";
  followed: boolean;
}) {
  const [failed, setFailed] = createSignal(false);
  const initial = () => getNameInitial(props.collaborator.username || "");
  return (
    <Avatar
      size={props.size ?? "default"}
      class={avatar}
      data-followed={props.followed ? "" : undefined}
    >
      <Show
        when={props.collaborator.avatarUrl && !failed()}
        fallback={
          <AvatarFallback
            class={avatarInitial}
            style={{ background: getClientColor(props.socketId, props.collaborator) }}
          >
            {initial()}
          </AvatarFallback>
        }
      >
        <AvatarImage
          src={props.collaborator.avatarUrl}
          alt={initial()}
          referrerPolicy="no-referrer"
          onLoadingStatusChange={(status) => {
            if (status === "error") setFailed(true);
          }}
        />
      </Show>
    </Avatar>
  );
}

/** In a call: speaking, muted, or the microphone. */
function CallStatus(props: { collaborator: Collaborator }) {
  const ui = useDiagramUI();
  return (
    <Show when={props.collaborator.isInCall}>
      <Show
        when={props.collaborator.isSpeaking}
        fallback={
          <Show
            when={props.collaborator.isMuted}
            fallback={
              <span title={ui.t("userList.hint.inCall")} data-testid="collaborator-in-call">
                <Mic aria-hidden="true" />
              </span>
            }
          >
            <span
              title={ui.t("userList.hint.micMuted")}
              data-muted=""
              data-testid="collaborator-muted"
            >
              <MicOff aria-hidden="true" />
            </span>
          </Show>
        }
      >
        <span
          class={speaking}
          title={ui.t("userList.hint.isSpeaking")}
          data-testid="collaborator-speaking"
        >
          <span />
          <span />
          <span />
        </span>
      </Show>
    </Show>
  );
}

/**
 * A collaborator, Excalidraw's `actionGoToCollaborator` panel: an avatar on
 * its own, or a row with the name and status in the list; pressing it follows
 * them, or stops following them.
 */
function CollaboratorEntry(props: {
  socketId: SocketId;
  collaborator: Collaborator;
  withName: boolean;
  isBeingFollowed: boolean;
}) {
  const ui = useDiagramUI();
  const follow = () => ui.run(actionGoToCollaborator, props.collaborator);
  const current = () => props.collaborator.isCurrentUser === true;
  return (
    <Show
      when={props.withName}
      fallback={
        <Tooltip>
          <button
            type="button"
            class={avatarButton}
            aria-label={props.collaborator.username || "Unknown user"}
            aria-pressed={current() ? undefined : props.isBeingFollowed}
            data-current-user={current() ? "" : undefined}
            onClick={follow}
            data-testid="collaborator-avatar"
          >
            <CollaboratorPicture
              socketId={props.socketId}
              collaborator={props.collaborator}
              followed={props.isBeingFollowed}
            />
            <Show when={props.collaborator.isInCall}>
              <span class={cornerStatus} aria-hidden="true">
                <CallStatus collaborator={props.collaborator} />
              </span>
            </Show>
          </button>
          <TooltipContent>{props.collaborator.username || "Unknown user"}</TooltipContent>
        </Tooltip>
      }
    >
      <button
        type="button"
        class={`${menuItem} ${collaboratorRow}`}
        aria-pressed={current() ? undefined : props.isBeingFollowed}
        disabled={current()}
        data-current-user={current() ? "" : undefined}
        onClick={() => {
          if (!current()) follow();
        }}
        data-testid="collaborator-row"
      >
        <CollaboratorPicture
          socketId={props.socketId}
          collaborator={props.collaborator}
          size="sm"
          followed={props.isBeingFollowed}
        />
        <span class={name}>{props.collaborator.username}</span>
        <span class={statusIcons} aria-hidden="true">
          <Show when={props.isBeingFollowed}>
            <span title={ui.t("userList.hint.followStatus")} data-testid="collaborator-followed">
              <Eye />
            </span>
          </Show>
          <Show when={current()}>{` (${ui.t("labels.you")})`}</Show>
          <CallStatus collaborator={props.collaborator} />
        </span>
      </button>
    </Show>
  );
}

/**
 * Excalidraw's `UserList`: the collaborators' avatars at the top end, as many
 * as fit, the current user's last with a menu listing everyone (searchable
 * once there are many) and the host's `currentUserControls`. On a phone, every
 * avatar, in the main menu.
 */
export function UserList(props: { mobile?: boolean }) {
  const ui = useDiagramUI();
  const userToFollow = () => ui.host().userToFollow?.socketId ?? null;
  const controls = (): Child => ui.host().currentUserControls?.(props.mobile === true);
  const collaborators = createMemo(
    (): ListedCollaborator[] =>
      Array.from(ui.store.state("collaborators"), ([socketId, collaborator]) => ({
        ...collaborator,
        socketId,
      })).filter((collaborator) => collaborator.username?.trim()),
    { equals: sameList },
  );
  const currentUser = () => collaborators().find((collaborator) => collaborator.isCurrentUser);
  const others = () => collaborators().filter((collaborator) => !collaborator.isCurrentUser);

  const [search, setSearch] = createSignal("");
  // the current user first, as Excalidraw orders the list
  const filtered = () => {
    const matching = collaborators().filter((collaborator) =>
      collaborator.username?.toLowerCase().includes(search()),
    );
    return [
      ...matching.filter((collaborator) => collaborator.isCurrentUser),
      ...matching.filter((collaborator) => !collaborator.isCurrentUser),
    ];
  };

  const [menuOpen, setMenuOpen] = createSignal(false);
  const [wrapperWidth, setWrapperWidth] = createSignal(DEFAULT_MAX_AVATARS * AVATAR_SLOT_WIDTH);
  const measure = (element: HTMLElement): void => {
    // the user list reaches from the middle of the editor, where the toolbar
    // is, to the end: it may use what the toolbar's half leaves
    const toolbar = element
      .closest("[data-diagram-ui]")
      ?.querySelector<HTMLElement>("[data-testid=toolbar]");
    const toolbarHalf = toolbar ? toolbar.getBoundingClientRect().width / 2 + TOOLBAR_CLEARANCE : 0;
    setWrapperWidth(Math.max(0, element.getBoundingClientRect().width - toolbarHalf));
  };
  const observe = (element: HTMLElement): void => {
    // measured once in the page, outside the render that made it
    queueMicrotask(() => measure(element));
    const ownerWindow = element.ownerDocument.defaultView;
    if (!ownerWindow || typeof ownerWindow.ResizeObserver !== "function") return;
    const observer = new ownerWindow.ResizeObserver(() => measure(element));
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  };

  const shown = (): ListedCollaborator[] => {
    const user = currentUser();
    const available = user ? wrapperWidth() - PILL_EXTRA_WIDTH : wrapperWidth();
    const totalSlots = Math.max(1, Math.min(8, Math.floor(available / AVATAR_SLOT_WIDTH)));
    const otherSlots = user ? Math.max(0, totalSlots - 1) : totalSlots;
    const visible = others().slice(0, otherSlots);
    return user ? [...visible, user] : visible;
  };

  const entry = (collaborator: ListedCollaborator, withName: boolean) => (
    <CollaboratorEntry
      socketId={collaborator.socketId}
      collaborator={collaborator}
      withName={withName}
      isBeingFollowed={collaborator.socketId === userToFollow()}
    />
  );

  return (
    <Show
      when={!props.mobile}
      fallback={
        <div class={mobileList} data-testid="user-list-mobile">
          <div class={mobileAvatars}>
            <For each={collaborators()} keyed={(each) => each.socketId}>
              {(collaborator) => entry(collaborator(), false)}
            </For>
          </div>
          <Show when={controls()}>
            {(given) => (
              <>
                <div class={divider} role="separator" />
                {given()}
              </>
            )}
          </Show>
        </div>
      }
    >
      <div class={wrapper} ref={observe} data-testid="user-list">
        <div class={row}>
          <For each={shown()} keyed={(each) => each.socketId}>
            {(collaborator) => (
              <Show when={collaborator().isCurrentUser} fallback={entry(collaborator(), false)}>
                <Popover isOpen={menuOpen()} onOpenChange={setMenuOpen}>
                  <PopoverTrigger>
                    <Button
                      variant="ghost"
                      class={pill}
                      aria-label={ui.t("labels.collaborators")}
                      data-testid="user-list-trigger"
                    >
                      <CollaboratorPicture
                        socketId={collaborator().socketId}
                        collaborator={collaborator()}
                        followed={false}
                      />
                      <ChevronDown aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="end" sideOffset={10}>
                    <div
                      class={menu}
                      role="dialog"
                      aria-label={ui.t("labels.collaborators")}
                      data-testid="user-list-menu"
                    >
                      <Show when={collaborators().length >= SHOW_COLLABORATORS_FILTER_AT}>
                        <Input
                          type="search"
                          aria-label={ui.t("quickSearch.placeholder")}
                          placeholder={ui.t("quickSearch.placeholder")}
                          value={search()}
                          onInput={(event: Event) =>
                            setSearch(
                              (event.currentTarget as HTMLInputElement).value.trim().toLowerCase(),
                            )
                          }
                          data-testid="user-list-search"
                        />
                      </Show>
                      <Show
                        when={filtered().length > 0}
                        fallback={<div class={empty}>{ui.t("userList.empty")}</div>}
                      >
                        <div class={list} data-testid="user-list-collaborators">
                          <div class={hint}>{ui.t("userList.hint.text")}</div>
                          <For each={filtered()} keyed={(each) => each.socketId}>
                            {(each) => entry(each(), true)}
                          </For>
                        </div>
                      </Show>
                      <Show when={controls()}>
                        {(given) => (
                          <>
                            <div class={divider} role="separator" />
                            <div onClick={() => setMenuOpen(false)}>{given()}</div>
                          </>
                        )}
                      </Show>
                    </div>
                  </PopoverContent>
                </Popover>
              </Show>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
