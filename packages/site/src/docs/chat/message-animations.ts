/**
 * The entrances a newly sent user row can make, as CSS animations rather than
 * a motion library's springs: transform and opacity only, so the row's
 * measured height is the same before and after and anchoring has nothing to
 * correct for. The springs are an overshooting `cubic-bezier`.
 */

import { css } from "@barqjs/css";

const fade = css`
  animation: message-fade 220ms ease-out;

  @keyframes message-fade {
    from {
      opacity: 0;
    }
  }
`;

const slideUp = css`
  animation: message-slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes message-slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
`;

const slideSide = css`
  animation: message-slide-side 280ms cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes message-slide-side {
    from {
      opacity: 0;
      transform: translateX(18px);
    }
  }

  [dir="rtl"] & {
    animation-name: message-slide-side-rtl;
  }

  @keyframes message-slide-side-rtl {
    from {
      opacity: 0;
      transform: translateX(-18px);
    }
  }
`;

const pop = css`
  transform-origin: 100% 100%;
  animation: message-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1);

  @keyframes message-pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.94);
    }
  }
`;

const springBounce = css`
  animation: message-spring-bounce 360ms cubic-bezier(0.34, 1.7, 0.64, 1);

  @keyframes message-spring-bounce {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.96);
    }
  }
`;

const blurFade = css`
  animation: message-blur-fade 280ms ease-out;

  @keyframes message-blur-fade {
    from {
      opacity: 0;
      filter: blur(4px);
      transform: translateY(6px);
    }
  }
`;

const scaleFade = css`
  animation: message-scale-fade 240ms ease-out;

  @keyframes message-scale-fade {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }
`;

export const MESSAGE_ANIMATIONS = [
  { id: "fade", name: "Fade", class: fade },
  { id: "slide-up", name: "Slide Up", class: slideUp },
  { id: "slide-side", name: "Slide Side", class: slideSide },
  { id: "pop", name: "Pop", class: pop },
  { id: "spring-bounce", name: "Spring Bounce", class: springBounce },
  { id: "blur-fade", name: "Blur Fade", class: blurFade },
  { id: "scale-fade", name: "Scale Fade", class: scaleFade },
] as const;

export type MessageAnimation = (typeof MESSAGE_ANIMATIONS)[number];
