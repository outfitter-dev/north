import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 gap-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">North Example</h1>
        <p className="text-muted-foreground">
          Next.js + shadcn/ui dogfood project for testing design system enforcement
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Example Card 1</CardTitle>
            <CardDescription>This is a shadcn card component</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              This example project will be used to test North&apos;s design system enforcement
              capabilities.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Example Card 2</CardTitle>
            <CardDescription>Another card for testing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button>Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
