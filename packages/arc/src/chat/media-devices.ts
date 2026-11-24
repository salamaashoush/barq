import { type Accessor, createSignal, onCleanup, untrack } from "@barqjs/core";
import { isServer } from "@barqjs/web";

import type { CallDevice, CallDevices } from "./call.tsx";

export type MediaDeviceKind = keyof CallDevices;

/**
 * Whether the page may use a microphone or a camera: `granted`, `denied`,
 * `prompt` while the browser would still ask, and `unknown` where it cannot
 * say (a server, a browser without the Permissions API for that device).
 */
export type MediaPermission = "granted" | "denied" | "prompt" | "unknown";

export interface MediaDevicesOptions {
  /** The devices chosen to start with, by kind. */
  defaultSelected?: Partial<Record<MediaDeviceKind, string>>;
  /** Told each change of device, as `CallControls`' `onDeviceChange` is. */
  onSelect?: (kind: MediaDeviceKind, deviceId: string) => void;
}

export interface MediaPermissions {
  microphone: MediaPermission;
  camera: MediaPermission;
}

export interface MediaKinds {
  audio?: boolean;
  video?: boolean;
}

export interface MediaDevicesState {
  /** Every microphone, camera and speaker the browser lists, for `CallControls`. */
  devices: Accessor<CallDevices>;
  /** The device chosen of each kind; the browser's default until one is. */
  selected: Accessor<Partial<Record<MediaDeviceKind, string>>>;
  select: (kind: MediaDeviceKind, deviceId: string) => void;
  permissions: Accessor<MediaPermissions>;
  /**
   * Asks for the microphone, the camera or both, which is what names the
   * devices: a browser lists them unnamed until the page may use them.
   * Resolves with whether every one asked for was allowed.
   */
  request: (kinds?: MediaKinds) => Promise<boolean>;
  /** Whether a speaker can be chosen: `HTMLMediaElement.setSinkId` exists. */
  canSelectSpeaker: Accessor<boolean>;
  /** `getUserMedia` constraints for the chosen microphone and camera. */
  constraints: () => MediaStreamConstraints;
}

const EMPTY: CallDevices = { audioinput: [], videoinput: [], audiooutput: [] };

function media(): MediaDevices | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

/** A device's name, or one made from its kind and place where the browser gives none. */
function named(info: MediaDeviceInfo, at: number): CallDevice {
  const label = info.label.trim();
  return {
    deviceId: info.deviceId,
    label: label === "" ? `${info.kind} ${String(at + 1)}` : label,
  };
}

async function query(name: "microphone" | "camera"): Promise<PermissionStatus | null> {
  if (typeof navigator === "undefined" || navigator.permissions === undefined) return null;
  try {
    return await navigator.permissions.query({ name });
  } catch {
    // Firefox and Safari refuse a name they do not support rather than answering for it.
    return null;
  }
}

/**
 * The microphones, cameras and speakers a call can use, kept up to date as
 * they are plugged in and out, with the one chosen of each and whether the
 * page may use them.
 *
 * ```tsx
 * const media = useMediaDevices();
 *
 * <CallControls
 *   devices={media.devices()}
 *   selected={media.selected()}
 *   onDeviceChange={media.select}
 *   …
 * />
 * <CallStage participants={people()} audioOutput={media.selected().audiooutput} />
 * navigator.mediaDevices.getUserMedia(media.constraints());
 * ```
 *
 * A browser lists devices without names until the page has been allowed a
 * microphone or a camera; `request` asks, and the list is read again with
 * the names. A chosen device that is unplugged falls back to the browser's
 * default. A server, and a page hydrating, list nothing.
 */
export function useMediaDevices(options: MediaDevicesOptions = {}): MediaDevicesState {
  const [devices, setDevices] = createSignal<CallDevices>(EMPTY);
  const [selected, setSelected] = createSignal<Partial<Record<MediaDeviceKind, string>>>(
    untrack(() => ({ ...options.defaultSelected })),
  );
  const [permissions, setPermissions] = createSignal<MediaPermissions>({
    microphone: "unknown",
    camera: "unknown",
  });

  async function read(): Promise<void> {
    const source = media();
    if (source === undefined) return;
    const listed = await source.enumerateDevices();
    function of(kind: MediaDeviceKind): CallDevice[] {
      return listed.filter((one) => one.kind === kind && one.deviceId !== "").map(named);
    }
    const next: CallDevices = {
      audioinput: of("audioinput"),
      videoinput: of("videoinput"),
      audiooutput: of("audiooutput"),
    };
    setDevices(next);
    setSelected((now) => {
      const kept: Partial<Record<MediaDeviceKind, string>> = {};
      for (const kind of ["audioinput", "videoinput", "audiooutput"] as const) {
        const id = now[kind];
        if (id !== undefined && (next[kind] ?? []).some((one) => one.deviceId === id)) {
          kept[kind] = id;
        }
      }
      return kept;
    });
  }

  if (!isServer && media() !== undefined) {
    const source = media() as MediaDevices;
    function changed(): void {
      void read();
    }
    source.addEventListener("devicechange", changed);
    onCleanup(() => source.removeEventListener("devicechange", changed));
    void read();

    let live = true;
    const stops: (() => void)[] = [];
    onCleanup(() => {
      live = false;
      for (const stop of stops) stop();
    });
    for (const name of ["microphone", "camera"] as const) {
      void query(name).then((status) => {
        if (status === null || !live) return;
        const write: () => void = () => {
          setPermissions((now) => ({ ...now, [name]: status.state }));
        };
        write();
        // A permission given or taken away in the browser's own settings names
        // the devices, or stops them being named, without a reload.
        function onChange(): void {
          write();
          void read();
        }
        status.addEventListener("change", onChange);
        stops.push(() => status.removeEventListener("change", onChange));
      });
    }
  }

  function select(kind: MediaDeviceKind, deviceId: string): void {
    setSelected((now) => ({ ...now, [kind]: deviceId }));
    options.onSelect?.(kind, deviceId);
  }

  async function request(kinds: MediaKinds = {}): Promise<boolean> {
    const source = media();
    if (source === undefined) return false;
    const audio = kinds.audio ?? true;
    const video = kinds.video ?? true;
    try {
      const stream = await source.getUserMedia({ audio, video });
      for (const track of stream.getTracks()) track.stop();
      setPermissions((now) => ({
        microphone: audio ? "granted" : now.microphone,
        camera: video ? "granted" : now.camera,
      }));
      await read();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setPermissions((now) => ({
          microphone: audio ? "denied" : now.microphone,
          camera: video ? "denied" : now.camera,
        }));
        return false;
      }
      throw error;
    }
  }

  function constraints(): MediaStreamConstraints {
    const chosen = selected();
    return {
      audio: chosen.audioinput === undefined ? true : { deviceId: { exact: chosen.audioinput } },
      video: chosen.videoinput === undefined ? true : { deviceId: { exact: chosen.videoinput } },
    };
  }

  return {
    devices,
    selected,
    select,
    permissions,
    request,
    canSelectSpeaker: () =>
      typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype,
    constraints,
  };
}
