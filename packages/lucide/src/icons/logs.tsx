import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Logs(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 5h1" />
      <path d="M3 12h1" />
      <path d="M3 19h1" />
      <path d="M8 5h1" />
      <path d="M8 12h1" />
      <path d="M8 19h1" />
      <path d="M13 5h8" />
      <path d="M13 12h8" />
      <path d="M13 19h8" />
    </svg>
  );
}
