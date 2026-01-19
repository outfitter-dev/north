import { describe, expect, test } from "bun:test";
import { extractComponentGraph } from "./extract-components.ts";

describe("extractComponentGraph", () => {
  test("extracts default import with JSX usage", () => {
    const source = `
import Button from './Button'

export default function Card() {
  return <Button>Click me</Button>
}
    `.trim();

    const result = extractComponentGraph(source, "components/Card.tsx");

    expect(result).toEqual([
      {
        parentFile: "components/Card.tsx",
        parentComponent: "Card",
        childFile: "components/Button.tsx",
        childComponent: "Button",
        line: 4,
      },
    ]);
  });

  test("extracts named import with JSX usage", () => {
    const source = `
import { Button } from './Button'

export default function Card() {
  return <Button>Click me</Button>
}
    `.trim();

    const result = extractComponentGraph(source, "components/Card.tsx");

    expect(result).toEqual([
      {
        parentFile: "components/Card.tsx",
        parentComponent: "Card",
        childFile: "components/Button.tsx",
        childComponent: "Button",
        line: 4,
      },
    ]);
  });

  test("extracts default + named imports from same statement", () => {
    const source = `
import Button, { Icon } from './Button'

export default function Card() {
  return (
    <div>
      <Button />
      <Icon />
    </div>
  )
}
    `.trim();

    const result = extractComponentGraph(source, "components/Card.tsx");

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      parentFile: "components/Card.tsx",
      parentComponent: "Card",
      childFile: "components/Button.tsx",
      childComponent: "Button",
      line: 6,
    });
    expect(result).toContainEqual({
      parentFile: "components/Card.tsx",
      parentComponent: "Card",
      childFile: "components/Button.tsx",
      childComponent: "Icon",
      line: 7,
    });
  });

  test("extracts multiple components from same file", () => {
    const source = `
import { Button, Card } from './ui/components'

export default function Dashboard() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  )
}
    `.trim();

    const result = extractComponentGraph(source, "pages/Dashboard.tsx");

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      parentFile: "pages/Dashboard.tsx",
      parentComponent: "Dashboard",
      childFile: "pages/ui/components.tsx",
      childComponent: "Card",
      line: 5,
    });
    expect(result).toContainEqual({
      parentFile: "pages/Dashboard.tsx",
      parentComponent: "Dashboard",
      childFile: "pages/ui/components.tsx",
      childComponent: "Button",
      line: 6,
    });
  });

  test("handles nested JSX elements", () => {
    const source = `
import { Card } from './Card'
import { Button } from './Button'

export default function Dashboard() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  )
}
    `.trim();

    const result = extractComponentGraph(source, "Dashboard.tsx");

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      parentFile: "Dashboard.tsx",
      parentComponent: "Dashboard",
      childFile: "Card.tsx",
      childComponent: "Card",
      line: 6,
    });
    expect(result).toContainEqual({
      parentFile: "Dashboard.tsx",
      parentComponent: "Dashboard",
      childFile: "Button.tsx",
      childComponent: "Button",
      line: 7,
    });
  });

  test("ignores lowercase JSX elements (DOM elements)", () => {
    const source = `
import { Button } from './Button'

export default function Card() {
  return (
    <div>
      <button>Not a component</button>
      <Button>Click me</Button>
    </div>
  )
}
    `.trim();

    const result = extractComponentGraph(source, "Card.tsx");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      childComponent: "Button",
    });
  });

  test("returns empty array when no imports", () => {
    const source = `
export default function Card() {
  return <div>No components</div>
}
    `.trim();

    const result = extractComponentGraph(source, "Card.tsx");

    expect(result).toEqual([]);
  });

  test("returns empty array when imports exist but no JSX usage", () => {
    const source = `
import { Button } from './Button'

export default function Card() {
  const btn = Button
  return <div>No JSX usage</div>
}
    `.trim();

    const result = extractComponentGraph(source, "Card.tsx");

    expect(result).toEqual([]);
  });

  test("handles self-closing JSX elements", () => {
    const source = `
import { Icon } from './Icon'

export default function Card() {
  return <Icon />
}
    `.trim();

    const result = extractComponentGraph(source, "Card.tsx");

    expect(result).toEqual([
      {
        parentFile: "Card.tsx",
        parentComponent: "Card",
        childFile: "Icon.tsx",
        childComponent: "Icon",
        line: 4,
      },
    ]);
  });

  test("derives parent component name from filename", () => {
    const source = `
import { Button } from './Button'

export default function MyComplexComponent() {
  return <Button>Click</Button>
}
    `.trim();

    const result = extractComponentGraph(source, "components/ui/Card.tsx");

    expect(result[0]?.parentComponent).toBe("Card");
  });

  test("handles relative paths with ../ navigation", () => {
    const source = `
import { Button } from '../Button'

export default function Card() {
  return <Button>Click</Button>
}
    `.trim();

    const result = extractComponentGraph(source, "components/ui/Card.tsx");

    expect(result).toEqual([
      {
        parentFile: "components/ui/Card.tsx",
        parentComponent: "Card",
        childFile: "components/Button.tsx",
        childComponent: "Button",
        line: 4,
      },
    ]);
  });

  test("handles multiple JSX usages of same component", () => {
    const source = `
import { Button } from './Button'

export default function Card() {
  return (
    <div>
      <Button>First</Button>
      <Button>Second</Button>
    </div>
  )
}
    `.trim();

    const result = extractComponentGraph(source, "Card.tsx");

    // Returns all occurrences (deduplication happens at build time)
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      childComponent: "Button",
      line: 6,
    });
    expect(result[1]).toMatchObject({
      childComponent: "Button",
      line: 7,
    });
  });

  test("handles namespace imports", () => {
    const source = `
import * as Icons from './icons'

export default function Card() {
  return <Icons.ChevronRight />
}
    `.trim();

    const result = extractComponentGraph(source, "Card.tsx");

    // Should skip namespace imports for now (too complex)
    expect(result).toEqual([]);
  });

  test("handles imports with aliases", () => {
    const source = `
import { Button as Btn } from './Button'

export default function Card() {
  return <Btn>Click</Btn>
}
    `.trim();

    const result = extractComponentGraph(source, "Card.tsx");

    expect(result).toEqual([
      {
        parentFile: "Card.tsx",
        parentComponent: "Card",
        childFile: "Button.tsx",
        childComponent: "Button",
        line: 4,
      },
    ]);
  });
});
