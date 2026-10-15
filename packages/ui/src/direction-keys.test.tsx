/**
 * The horizontal arrows of every roving widget, under a right-to-left provider.
 *
 * Each widget is written with no `dir` of its own, so the only thing that can
 * turn its arrows round is the direction `DirectionProvider` declared. Right
 * to left, the next item is the one on the LEFT.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { flush, type Child } from "@barqjs/core";
import { cleanup, render, screen, tick, user } from "@barqjs/testing";

import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "./ui/carousel.tsx";
import { DirectionProvider } from "./ui/direction.tsx";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "./ui/menubar.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./ui/navigation-menu.tsx";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "./ui/pagination.tsx";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group.tsx";
import { Slider } from "./ui/slider.tsx";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";

afterEach(cleanup);

function Rtl(props: { children?: Child }) {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">{props.children}</div>
    </DirectionProvider>
  );
}

const focusedText = (): string => (document.activeElement?.textContent ?? "").trim();

describe("right to left, the left arrow is the next item", () => {
  test("tabs", async () => {
    render(() => (
      <Rtl>
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
        </Tabs>
      </Rtl>
    ));
    await user.click(screen.getByRole("tab", { name: "Account" }));
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(focusedText()).toBe("Password");
    expect(screen.getByRole("tab", { name: "Password" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    await user.keyboard("{ArrowRight}");
    expect(focusedText()).toBe("Account");
  });

  test("toggle group", async () => {
    render(() => (
      <Rtl>
        <ToggleGroup type="single" aria-label="Alignment">
          <ToggleGroupItem value="start">Start</ToggleGroupItem>
          <ToggleGroupItem value="end">End</ToggleGroupItem>
        </ToggleGroup>
      </Rtl>
    ));
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.keyboard("{ArrowLeft}");
    expect(focusedText()).toBe("End");
    await user.keyboard("{ArrowRight}");
    expect(focusedText()).toBe("Start");
  });

  test("radio group", async () => {
    render(() => (
      <Rtl>
        <RadioGroup aria-label="Plan" orientation="horizontal" defaultValue="plus">
          <RadioGroupItem value="plus" aria-label="Plus" />
          <RadioGroupItem value="pro" aria-label="Pro" />
        </RadioGroup>
      </Rtl>
    ));
    await user.click(screen.getByRole("radio", { name: "Plus" }));
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Pro" }).checked).toBe(true);
    await user.keyboard("{ArrowRight}");
    flush();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Plus" }).checked).toBe(true);
  });

  test("menubar", async () => {
    render(() => (
      <Rtl>
        <Menubar aria-label="Application">
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>New tab</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>Undo</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </Rtl>
    ));
    await user.tab();
    expect(focusedText()).toBe("File");
    await user.keyboard("{ArrowLeft}");
    expect(focusedText()).toBe("Edit");
    await user.keyboard("{ArrowRight}");
    expect(focusedText()).toBe("File");
  });

  test("slider", async () => {
    render(() => (
      <Rtl>
        <Slider aria-label="Volume" defaultValue={[50]} />
      </Rtl>
    ));
    const thumb = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    await user.tab();
    expect(document.activeElement).toBe(thumb);
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(thumb.value).toBe("51");
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{ArrowRight}");
    flush();
    expect(thumb.value).toBe("49");
  });

  test("navigation menu", async () => {
    render(() => (
      <Rtl>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Home</NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavigationMenuLink href="/intro">Introduction</NavigationMenuLink>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Docs</NavigationMenuTrigger>
              <NavigationMenuContent>
                <NavigationMenuLink href="/docs">Guides</NavigationMenuLink>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </Rtl>
    ));
    await user.tab();
    expect(focusedText()).toBe("Home");
    await user.keyboard("{ArrowLeft}");
    expect(focusedText()).toBe("Docs");
    await user.keyboard("{ArrowRight}");
    expect(focusedText()).toBe("Home");
  });

  test("carousel", async () => {
    const seen: CarouselApi[] = [];
    render(() => (
      <Rtl>
        <Carousel aria-label="Photos" setApi={(api) => seen.push(api)}>
          <CarouselContent>
            <CarouselItem>One</CarouselItem>
            <CarouselItem>Two</CarouselItem>
          </CarouselContent>
        </Carousel>
      </Rtl>
    ));
    await tick();
    const api = seen[0] as CarouselApi;
    const calls: string[] = [];
    api.scrollNext = () => {
      calls.push("next");
    };
    api.scrollPrev = () => {
      calls.push("prev");
    };
    const region = screen.getByRole("region", { name: "Photos" });
    user.keyDown("ArrowLeft", { target: region });
    user.keyDown("ArrowRight", { target: region });
    expect(calls).toEqual(["next", "prev"]);
  });

  test("pagination has no arrow keys to turn round: its links are Tab stops in reading order", async () => {
    render(() => (
      <Rtl>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationLink href="?page=1">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="?page=2">2</PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Rtl>
    ));
    await user.tab();
    expect(focusedText()).toBe("1");
    await user.keyboard("{ArrowLeft}");
    expect(focusedText()).toBe("1");
    await user.tab();
    expect(focusedText()).toBe("2");
  });
});
