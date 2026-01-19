const case30Base = ["bg-red-500", "text-foreground"];
export function Case30ArraySpread() {
  return <div className={clsx([...case30Base, "p-4"])}>Case 30</div>;
}
