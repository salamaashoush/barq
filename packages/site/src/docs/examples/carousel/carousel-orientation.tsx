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
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 6);
`;

const number = css`
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 600;
`;

const frame = css`
  width: 100%;
  max-width: 20rem;
`;

const track = css`
  margin-top: calc(var(--spacing) * -1);
  height: 270px;
`;

const half = css`
  flex-basis: 50%;
  padding-top: calc(var(--spacing) * 1);
`;

export default function CarouselOrientation() {
  return (
    <Carousel opts={{ align: "start" }} orientation="vertical" class={frame}>
      <CarouselContent class={track}>
        <For each={slides}>
          {(_: number, index: () => number) => (
            <CarouselItem class={half}>
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
