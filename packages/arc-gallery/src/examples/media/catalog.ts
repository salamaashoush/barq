import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "media",
  title: "Media",
  description: "Images, galleries, a media player and a clip recorder.",
  examples: [
    {
      id: "image",
      title: "Image",
      description:
        "A picture that holds its shape, loads lazily over a placeholder and fails visibly.",
      covers: ["Image"],
    },
    {
      id: "gallery",
      title: "Gallery and lightbox",
      description:
        "Thumbnails that open a full-screen viewer at themselves, and a Lightbox whose photo and open state are the page's.",
      covers: ["Gallery", "Lightbox"],
    },
    {
      id: "media-player",
      title: "Media player",
      description:
        "Video with captions, chapters and a transcript that follows it, and audio at its own speeds.",
      covers: ["MediaPlayer"],
    },
    {
      id: "clip-recorder",
      title: "Clip recorder",
      description:
        "Records audio or video in the page once the reader turns the device on; nothing is asked before.",
      covers: ["ClipRecorder"],
    },
  ],
};
