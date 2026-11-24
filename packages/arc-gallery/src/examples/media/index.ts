import type { Demos } from "../../gallery/types.ts";
import ClipRecorder from "./clip-recorder.tsx";
import clipRecorder from "./clip-recorder.tsx?raw";
import Gallery from "./gallery.tsx";
import gallery from "./gallery.tsx?raw";
import Image from "./image.tsx";
import image from "./image.tsx?raw";
import MediaPlayer from "./media-player.tsx";
import mediaPlayer from "./media-player.tsx?raw";

export const demos: Demos = {
  image: { component: Image, code: image },
  gallery: { component: Gallery, code: gallery },
  "media-player": { component: MediaPlayer, code: mediaPlayer },
  "clip-recorder": { component: ClipRecorder, code: clipRecorder },
};
