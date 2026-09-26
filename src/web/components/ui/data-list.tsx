import { DataList as RadixDataList } from "@radix-ui/themes";

export type DataListItem = { label: React.ReactNode; value: React.ReactNode };

type DataListProps = {
  items: readonly DataListItem[];
  /** Stack label over value on phones (default), side by side from sm up. */
  orientation?: "horizontal" | "vertical";
  className?: string;
};

/** Facts as label/value pairs (project details, record fields). Skip items with no value before passing them. */
export function DataList({ items, orientation, className }: DataListProps) {
  return (
    <RadixDataList.Root orientation={orientation ?? { initial: "vertical", sm: "horizontal" }} className={className}>
      {items.map((item, i) => (
        <RadixDataList.Item key={i}>
          <RadixDataList.Label minWidth="120px">{item.label}</RadixDataList.Label>
          <RadixDataList.Value>{item.value}</RadixDataList.Value>
        </RadixDataList.Item>
      ))}
    </RadixDataList.Root>
  );
}
