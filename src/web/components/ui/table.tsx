import { Table as RadixTable } from "@radix-ui/themes";

// Radix Table with the old short names, so existing screens keep compiling. Root scrolls horizontally on phones.

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <RadixTable.Root variant="surface" className={className}>
      {children}
    </RadixTable.Root>
  );
}

export const THead = RadixTable.Header;
export const TBody = RadixTable.Body;
export const TR = RadixTable.Row;
export const TH = RadixTable.ColumnHeaderCell;
export const TD = RadixTable.Cell;
