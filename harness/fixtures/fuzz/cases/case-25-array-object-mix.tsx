const case25Active = true;
export function Case25ArrayObjectMix() {
  return (
    <div className={clsx("bg-red-500", ["text-foreground", { "p-[13px]": case25Active }])}>
      Case 25
    </div>
  );
}
