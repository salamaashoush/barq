import { For, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Card,
  CardContent,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@barqjs/ui";

const slides = [1, 2, 3, 4, 5];

const face = css`
  display: flex;
  aspect-ratio: 1 / 1;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 6);
`;

const card = css`
  margin: 1px;
`;

const number = css`
  font-size: 2.25rem;
  line-height: 2.5rem;
  font-weight: 600;
`;

const frame = css`
  margin-inline: auto;
  max-width: 10rem;

  @media (width >= 40rem) {
    max-width: 20rem;
  }
`;

const carousel = css`
  width: 100%;
  max-width: 20rem;
`;

const status = css`
  padding-block: calc(var(--spacing) * 2);
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function CarouselApiDemo() {
  const [current, setCurrent] = createSignal(0);
  const [count, setCount] = createSignal(0);

  const connect = (api: CarouselApi): void => {
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  };

  return (
    <div class={frame}>
      <Carousel setApi={connect} class={carousel}>
        <CarouselContent>
          <For each={slides}>
            {(_: number, index: () => number) => (
              <CarouselItem>
                <Card class={card}>
                  <CardContent class={face}>
                    <span class={number}>{index() + 1}</span>
                  </CardContent>
                </Card>
              </CarouselItem>
            )}
          </For>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <div class={status}>
        Slide {current()} of {count()}
      </div>
    </div>
  );
}
