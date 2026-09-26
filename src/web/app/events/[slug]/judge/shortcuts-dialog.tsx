import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

type Row = { keys: string[][]; label: string };

export function ShortcutsDialog({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: Row[] }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" description="Shortcuts pause while you type in the comment box. Press Esc there to get them back.">
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <dt className="text-muted">{r.label}</dt>
            <dd className="flex shrink-0 items-center gap-1.5">
              {r.keys.map((combo, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="px-0.5 text-xs text-subtle">or</span>}
                  {combo.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
