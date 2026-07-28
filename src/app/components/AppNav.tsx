"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  ListOrdered,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/directory", label: "Directory", icon: Users },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/queue", label: "Queue", icon: ListOrdered },
];

export function AppNav({
  email,
  gmailConnected,
}: {
  email?: string;
  gmailConnected?: boolean;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="wax-seal flex size-8 items-center justify-center rounded-lg text-primary-foreground">
            <Sparkles className="size-3.5" />
          </span>
          <span className="font-display text-lg">
            ScholarReach <span className="text-primary">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
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
          <Badge
            variant={gmailConnected ? "secondary" : "outline"}
            className="hidden max-w-[240px] truncate sm:inline-flex"
          >
            {gmailConnected ? `Connected · ${email}` : "Gmail offline"}
          </Badge>
          <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
            Account
          </Link>
        </div>
      </div>

      <Separator />
      <nav className="flex gap-1 overflow-x-auto px-4 py-2 md:hidden">
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
