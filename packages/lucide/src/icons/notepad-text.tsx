import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function NotepadText(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 2v4" />
      <path d="M12 2v4" />
      <path d="M16 2v4" />
      <rect width="16" height="18" x="4" y="4" rx="2" />
      <path d="M8 10h6" />
      <path d="M8 14h8" />
      <path d="M8 18h5" />
    </svg>
  );
}
