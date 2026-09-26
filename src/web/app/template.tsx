/** Re-mounts on every navigation, so the CSS entrance replays per page and still renders without JS. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
