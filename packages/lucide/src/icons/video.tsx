import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Video(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}
