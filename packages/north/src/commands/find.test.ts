import { describe, expect, test } from "bun:test";
import { TYPOGRAPHY_PREFIXES, buildTypographyUsage, parseTypographyUtility } from "./find.ts";

describe("parseTypographyUtility", () => {
  test("parses text size utilities", () => {
    expect(parseTypographyUtility("text-xs")).toEqual({ utility: "text", value: "xs" });
    expect(parseTypographyUtility("text-sm")).toEqual({ utility: "text", value: "sm" });
    expect(parseTypographyUtility("text-base")).toEqual({ utility: "text", value: "base" });
    expect(parseTypographyUtility("text-lg")).toEqual({ utility: "text", value: "lg" });
    expect(parseTypographyUtility("text-xl")).toEqual({ utility: "text", value: "xl" });
    expect(parseTypographyUtility("text-2xl")).toEqual({ utility: "text", value: "2xl" });
    expect(parseTypographyUtility("text-3xl")).toEqual({ utility: "text", value: "3xl" });
  });

  test("parses font weight utilities", () => {
    expect(parseTypographyUtility("font-thin")).toEqual({ utility: "font", value: "thin" });
    expect(parseTypographyUtility("font-light")).toEqual({ utility: "font", value: "light" });
    expect(parseTypographyUtility("font-normal")).toEqual({ utility: "font", value: "normal" });
    expect(parseTypographyUtility("font-medium")).toEqual({ utility: "font", value: "medium" });
    expect(parseTypographyUtility("font-semibold")).toEqual({ utility: "font", value: "semibold" });
    expect(parseTypographyUtility("font-bold")).toEqual({ utility: "font", value: "bold" });
  });

  test("parses leading (line-height) utilities", () => {
    expect(parseTypographyUtility("leading-none")).toEqual({ utility: "leading", value: "none" });
    expect(parseTypographyUtility("leading-tight")).toEqual({ utility: "leading", value: "tight" });
    expect(parseTypographyUtility("leading-normal")).toEqual({
      utility: "leading",
      value: "normal",
    });
    expect(parseTypographyUtility("leading-relaxed")).toEqual({
      utility: "leading",
      value: "relaxed",
    });
    expect(parseTypographyUtility("leading-loose")).toEqual({ utility: "leading", value: "loose" });
  });

  test("parses tracking (letter-spacing) utilities", () => {
    expect(parseTypographyUtility("tracking-tighter")).toEqual({
      utility: "tracking",
      value: "tighter",
    });
    expect(parseTypographyUtility("tracking-tight")).toEqual({
      utility: "tracking",
      value: "tight",
    });
    expect(parseTypographyUtility("tracking-normal")).toEqual({
      utility: "tracking",
      value: "normal",
    });
    expect(parseTypographyUtility("tracking-wide")).toEqual({ utility: "tracking", value: "wide" });
    expect(parseTypographyUtility("tracking-wider")).toEqual({
      utility: "tracking",
      value: "wider",
    });
    expect(parseTypographyUtility("tracking-widest")).toEqual({
      utility: "tracking",
      value: "widest",
    });
  });

  test("handles responsive prefixes", () => {
    expect(parseTypographyUtility("md:text-lg")).toEqual({ utility: "text", value: "lg" });
    expect(parseTypographyUtility("lg:font-bold")).toEqual({ utility: "font", value: "bold" });
    expect(parseTypographyUtility("sm:leading-tight")).toEqual({
      utility: "leading",
      value: "tight",
    });
  });

  test("handles state prefixes", () => {
    expect(parseTypographyUtility("hover:text-xl")).toEqual({ utility: "text", value: "xl" });
    expect(parseTypographyUtility("focus:font-medium")).toEqual({
      utility: "font",
      value: "medium",
    });
  });

  test("handles arbitrary values", () => {
    expect(parseTypographyUtility("text-[14px]")).toEqual({ utility: "text", value: "[14px]" });
    expect(parseTypographyUtility("leading-[1.5]")).toEqual({ utility: "leading", value: "[1.5]" });
    expect(parseTypographyUtility("tracking-[0.05em]")).toEqual({
      utility: "tracking",
      value: "[0.05em]",
    });
  });

  test("handles token shorthand syntax", () => {
    expect(parseTypographyUtility("text-(--text-body)")).toEqual({
      utility: "text",
      value: "(--text-body)",
    });
    expect(parseTypographyUtility("font-(--font-weight-heading)")).toEqual({
      utility: "font",
      value: "(--font-weight-heading)",
    });
  });

  test("returns null for non-typography utilities", () => {
    expect(parseTypographyUtility("bg-blue-500")).toBeNull();
    expect(parseTypographyUtility("p-4")).toBeNull();
    expect(parseTypographyUtility("flex")).toBeNull();
    expect(parseTypographyUtility("text-blue-500")).toBeNull(); // color, not typography
  });
});

describe("TYPOGRAPHY_PREFIXES", () => {
  test("includes all typography prefixes", () => {
    expect(TYPOGRAPHY_PREFIXES).toContain("text");
    expect(TYPOGRAPHY_PREFIXES).toContain("font");
    expect(TYPOGRAPHY_PREFIXES).toContain("leading");
    expect(TYPOGRAPHY_PREFIXES).toContain("tracking");
  });
});

describe("buildTypographyUsage", () => {
  test("aggregates typography values", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 5 },
      { className: "text-base", resolvedToken: null, count: 3 },
      { className: "text-sm", resolvedToken: null, count: 2 },
      { className: "font-medium", resolvedToken: null, count: 4 },
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.values).toContainEqual({ value: "sm", count: 7 });
    expect(result.values).toContainEqual({ value: "base", count: 3 });
    expect(result.values).toContainEqual({ value: "medium", count: 4 });
  });

  test("aggregates by utility type", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 5 },
      { className: "text-lg", resolvedToken: null, count: 3 },
      { className: "font-bold", resolvedToken: null, count: 4 },
      { className: "leading-tight", resolvedToken: null, count: 2 },
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.utilities).toContainEqual({ utility: "text", count: 8 });
    expect(result.utilities).toContainEqual({ utility: "font", count: 4 });
    expect(result.utilities).toContainEqual({ utility: "leading", count: 2 });
  });

  test("categorizes tokenized vs scale vs arbitrary", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 3 }, // scale
      { className: "text-(--text-body)", resolvedToken: null, count: 2 }, // tokenized
      { className: "text-[14px]", resolvedToken: null, count: 1 }, // arbitrary
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.categories.scale).toBe(3);
    expect(result.categories.tokenized).toBe(2);
    expect(result.categories.arbitrary).toBe(1);
  });

  test("sorts values by count descending", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 1 },
      { className: "text-lg", resolvedToken: null, count: 10 },
      { className: "text-base", resolvedToken: null, count: 5 },
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.values[0]).toEqual({ value: "lg", count: 10 });
    expect(result.values[1]).toEqual({ value: "base", count: 5 });
    expect(result.values[2]).toEqual({ value: "sm", count: 1 });
  });
});
