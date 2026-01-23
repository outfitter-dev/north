import { describe, expect, test } from "bun:test";
import { extractRepeatedSpacingIssues } from "./repeated-spacing.ts";

describe("repeated-spacing-pattern", () => {
  test("flags repeated spaces in JSX text", () => {
    const source = "export function Example() { return <p>Foo  bar</p>; }";
    const issues = extractRepeatedSpacingIssues(source, "Example.tsx", "warn");
    expect(issues.length).toBe(1);
    expect(issues[0]?.message).toContain("consecutive spaces");
  });

  test("respects allow-in-strings option", () => {
    const source = `const label = "Foo  bar"; export const Example = () => <p>{label}</p>;`;
    const issues = extractRepeatedSpacingIssues(source, "Example.tsx", "warn", {
      "allow-in-strings": true,
    });
    expect(issues.length).toBe(0);
  });

  test("respects allow-after-line-start option", () => {
    const source = "export function Example() { return <p>Foo\n  bar</p>; }";
    const issues = extractRepeatedSpacingIssues(source, "Example.tsx", "warn", {
      "allow-after-line-start": false,
    });
    expect(issues.length).toBe(1);
  });
});
