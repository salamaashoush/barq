import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BotMinus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 8V4H8" />
      <path d="M15 13v2" />
      <path d="M2 14h2" />
      <path d="M20 15v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6" />
      <path d="M22 19h-6" />
      <path d="M9 13v2" />
    </svg>
  );
}
