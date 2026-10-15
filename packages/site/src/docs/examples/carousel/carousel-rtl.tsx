import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Card,
  CardContent,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  DirectionProvider,
} from "@barqjs/ui";

const slides = ["١", "٢", "٣", "٤", "٥"];

const slide = css`
  padding: calc(var(--spacing) * 1);
`;

const face = css`
  display: flex;
  aspect-ratio: 1 / 1;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 6);
`;

const number = css`
  font-size: 2.25rem;
  line-height: 2.5rem;
  font-weight: 600;
`;

const frame = css`
  width: 100%;
  max-width: 12rem;

  @media (width >= 40rem) {
    max-width: 20rem;
  }
`;

export default function CarouselRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Carousel class={frame}>
          <CarouselContent>
            <For each={slides}>
              {(numeral: string) => (
                <CarouselItem>
                  <div class={slide}>
                    <Card>
                      <CardContent class={face}>
                        <span class={number}>{numeral}</span>
                      </CardContent>
                    </Card>
                  </div>
                </CarouselItem>
              )}
            </For>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </DirectionProvider>
  );
}
