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
} from "@barqjs/ui";

const slides = [1, 2, 3, 4, 5];

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
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 600;
`;

const frame = css`
  width: 100%;
  max-width: 12rem;

  @media (width >= 40rem) {
    max-width: 20rem;
  }
  @media (width >= 48rem) {
    max-width: 24rem;
  }
`;

const track = css`
  margin-inline-start: calc(var(--spacing) * -1);
`;

const spaced = css`
  flex-basis: 50%;
  padding-inline-start: calc(var(--spacing) * 1);

  @media (width >= 64rem) {
    flex-basis: calc(100% / 3);
  }
`;

export default function CarouselSpacing() {
  return (
    <Carousel class={frame}>
      <CarouselContent class={track}>
        <For each={slides}>
          {(_: number, index: () => number) => (
            <CarouselItem class={spaced}>
              <div class={slide}>
                <Card>
                  <CardContent class={face}>
                    <span class={number}>{index() + 1}</span>
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
  );
}
