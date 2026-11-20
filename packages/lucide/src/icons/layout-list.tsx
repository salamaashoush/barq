import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LayoutList(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
      <path d="M14 4h7" />
      <path d="M14 9h7" />
      <path d="M14 15h7" />
      <path d="M14 20h7" />
    </svg>
  );
}
