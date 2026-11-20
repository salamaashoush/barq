import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRoundX(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m16.5 16.5 5 5" />
      <path d="M2 21a8 8 0 0 1 11.531-7.18" />
      <path d="m21.5 16.5-5 5" />
      <circle cx="10" cy="8" r="5" />
    </svg>
  );
}
