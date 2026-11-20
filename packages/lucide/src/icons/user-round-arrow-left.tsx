import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRoundArrowLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m19 16-3 3" />
      <path d="M2 21a8 8 0 0 1 12.664-6.5" />
      <path d="M22 19h-6l3 3" />
      <circle cx="10" cy="8" r="5" />
    </svg>
  );
}
