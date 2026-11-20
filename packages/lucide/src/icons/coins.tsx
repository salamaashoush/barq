import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Coins(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M13.744 17.736a6 6 0 1 1-7.48-7.48" />
      <path d="M15 6h1v4" />
      <path d="m6.134 14.768.866-.5 2 3.464" />
      <circle cx="16" cy="8" r="6" />
    </svg>
  );
}
