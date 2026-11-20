import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Opacity(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 3h.01" />
      <path d="M12 9h.01" />
      <path d="M15 6h.01" />
      <path d="M18 3h.01" />
      <path d="M21 6v13a2 2 0 0 1-2 2H6" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
      <path d="M3 6h.01" />
      <path d="M6 15h.01" />
      <path d="M6 3h.01" />
      <path d="M6 9h.01" />
      <path d="M9 12h.01" />
      <path d="M9 6h.01" />
    </svg>
  );
}
