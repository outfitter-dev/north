const case05Active = true;
export function Case05NonLiteralCn() {
  return <div className={cn("bg-red-500", case05Active && "text-foreground")}>Case 05</div>;
}
