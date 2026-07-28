"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  ListOrdered,
  UserRound,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDemoSession, type DemoSession } from "@/lib/demo-auth";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/directory", label: "Directory", icon: Users },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/queue", label: "Queue", icon: ListOrdered },
  { href: "/connect-inbox", label: "Inbox", icon: Mail },
  { href: "/onboarding", label: "Profile", icon: UserRound },
];

export function AppNav({
  email,
  gmailConnected,
}: {
  email?: string;
  gmailConnected?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);

  useEffect(() => {
    const sync = () => setSession(getDemoSession());
    sync();
    window.addEventListener("scholarreach-auth", sync);
    return () => window.removeEventListener("scholarreach-auth", sync);
  }, []);

  const displayEmail = session?.email || email || "";
  const connected = session?.gmailConnected ?? !!gmailConnected;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            SR
          </span>
          <span className="font-display text-lg">ScholarReach</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  buttonVariants({
                    variant: active ? "secondary" : "ghost",
                    size: "sm",
                  })
                )}
              >
                <Icon data-icon="inline-start" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {displayEmail && (
            <Badge
              variant={connected ? "secondary" : "outline"}
              className="hidden max-w-[220px] truncate sm:inline-flex"
            >
              {connected ? `Inbox · ${displayEmail}` : displayEmail}
            </Badge>
          )}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Account
          </button>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              buttonVariants({
                size: "xs",
                variant: pathname === href ? "secondary" : "ghost",
              }),
              "whitespace-nowrap"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
