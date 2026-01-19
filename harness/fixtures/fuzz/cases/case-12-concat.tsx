const case12Active = true;
export function Case12Concat() {
  // biome-ignore lint/style/useTemplate: fixture keeps explicit concatenation.
  return <div className={"bg-red-500 " + (case12Active ? "text-foreground" : "")}>Case 12</div>;
}
