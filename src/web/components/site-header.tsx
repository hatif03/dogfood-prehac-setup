"use client";

import { IconButton } from "@radix-ui/themes";
import { PortalThemeSubtree } from "@/components/theme-provider";
import { LayoutList, LogOut, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, type User } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; active: boolean; external?: boolean };

function navItems(pathname: string, signedIn: boolean): NavItem[] {
  const home = pathname === "/";
  return [
    ...(signedIn ? [{ href: "/", label: "Your work", active: home }] : []),
    { href: signedIn ? "/#events" : "/", label: "Events", active: pathname.startsWith("/events") || (!signedIn && home) },
    { href: "/verify", label: "Verify", active: pathname.startsWith("/verify") },
    { href: "/docs", label: "API docs", active: false, external: true },
  ];
}

function NavLink({ item, onNavigate, className }: { item: NavItem; onNavigate?: () => void; className?: string }) {
  const cls = cn(
    "rounded-(--radius-2) px-3 py-1.5 text-sm font-medium transition-colors",
    item.active ? "bg-surface-2 text-fg" : "text-muted hover:bg-tint hover:text-fg",
    className,
  );
  return item.external ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={cls} onClick={onNavigate}>
      {item.label}
    </a>
  ) : (
    <Link href={item.href} className={cls} aria-current={item.active ? "page" : undefined} onClick={onNavigate}>
      {item.label}
    </Link>
  );
}

function AccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const name = user.display_name || user.email;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="flex cursor-pointer items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-tint sm:pr-3"
        >
          <Avatar name={name} size="sm" />
          <span className="hidden max-w-32 truncate text-sm text-fg sm:inline">{name}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" variant="soft" className="min-w-56">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-fg">{name}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
          {user.is_platform_admin && (
            <Badge tone="violet" className="mt-2">
              Platform admin
            </Badge>
          )}
        </div>
        <DropdownMenu.Separator />
        <DropdownMenu.Item asChild>
          <Link href="/">
            <LayoutList className="size-4" /> Your work
          </Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Link href="/events/new">
            <Plus className="size-4" /> Create event
          </Link>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={onSignOut}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

/** Sheet from the right on phones. Portalled out of the root Theme, so it re-enters one to keep the tokens. */
function MobileMenu({ items, user, pathname, onSignOut }: { items: NavItem[]; user: User | null; pathname: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <IconButton variant="ghost" color="gray" size="2" aria-label="Open menu" className="m-0 cursor-pointer md:hidden">
          <Menu className="size-5" />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <PortalThemeSubtree>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-page-in" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-[101] flex w-[min(20rem,85vw)] flex-col gap-1 bg-(--color-panel-solid) p-4 shadow-(--shadow-6) data-[state=open]:animate-page-in">
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="section-index">Menu</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton variant="ghost" color="gray" size="2" aria-label="Close menu" className="m-0 cursor-pointer">
                  <X className="size-5" />
                </IconButton>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
            <nav aria-label="Mobile" className="flex flex-col gap-1">
              {items.map((item) => (
                <NavLink key={item.label} item={item} onNavigate={close} className="py-2.5 text-base" />
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
              {user ? (
                <>
                  <Button href="/events/new" variant="secondary" onClick={close}>
                    <Plus /> Create event
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      close();
                      onSignOut();
                    }}
                  >
                    <LogOut /> Sign out
                  </Button>
                </>
              ) : (
                <Button href={`/login?next=${encodeURIComponent(pathname)}`} onClick={close}>
                  Sign in
                </Button>
              )}
            </div>
          </Dialog.Content>
        </PortalThemeSubtree>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  async function signOut() {
    await logout();
    router.push("/");
    router.refresh();
  }

  if (pathname.startsWith("/widget")) return null; // embeds render without site chrome

  const items = navItems(pathname, Boolean(user));
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <NavLink key={item.label} item={item} />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {loading ? (
            <Skeleton className="h-8 w-8 rounded-full sm:w-28" />
          ) : user ? (
            <AccountMenu user={user} onSignOut={signOut} />
          ) : (
            <Button href={`/login?next=${encodeURIComponent(pathname)}`} size="sm" variant="secondary" className="hidden sm:inline-flex">
              Sign in
            </Button>
          )}
          <MobileMenu items={items} user={user} pathname={pathname} onSignOut={signOut} />
        </div>
      </div>
    </header>
  );
}
