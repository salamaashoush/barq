import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function EighthNote(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m19 6-5.2-3.9a.5.5 0 0 0-.8.4V18" />
      <circle cx="9" cy="18" r="4" />
    </svg>
  );
}
