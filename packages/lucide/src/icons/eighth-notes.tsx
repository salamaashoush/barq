import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function EighthNotes(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19" />
      <circle cx="18" cy="16" r="3" />
      <circle cx="6" cy="19" r="3" />
    </svg>
  );
}
