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
  type CarouselApi,
  type CarouselPlugin,
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
  font-size: 2.25rem;
  line-height: 2.5rem;
  font-weight: 600;
`;

const frame = css`
  width: 100%;
  max-width: 10rem;

  @media (width >= 40rem) {
    max-width: 20rem;
  }
`;

/**
 * Embla's autoplay, as the engine's plugin interface defines one: it moves on
 * every `delay`, wraps to the first slide at the end, and stops for good when
 * the person takes hold of the track.
 */
function autoplay(delay: number) {
  let api: CarouselApi | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = (): void => {
    clearInterval(timer);
    timer = undefined;
  };
  const reset = (): void => {
    stop();
    if (api === undefined) return;
    timer = setInterval(() => {
      if (api === undefined) return;
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, delay);
  };
  const plugin: CarouselPlugin[number] = {
    name: "autoplay",
    options: {},
    init(embla: CarouselApi) {
      api = embla;
      embla.on("pointerDown", stop);
      reset();
    },
    destroy() {
      stop();
      api = undefined;
    },
  };
  return { plugin, stop, reset };
}

export default function CarouselPluginExample() {
  const play = autoplay(2000);

  return (
    <Carousel
      plugins={[play.plugin]}
      class={frame}
      onMouseEnter={play.stop}
      onMouseLeave={play.reset}
    >
      <CarouselContent>
        <For each={slides}>
          {(_: number, index: () => number) => (
            <CarouselItem>
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
