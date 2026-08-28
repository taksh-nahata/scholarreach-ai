"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  ListOrdered,
  UserRound,
  Mail,
  Settings,
  MessageSquareReply,
  Lightbulb,
  BarChart3,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import { allowDemoFallback } from "@/lib/live-mode";
import { getDemoSession } from "@/lib/demo-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/directory", label: "Directory", icon: Users },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/queue", label: "Queue", icon: ListOrdered },
];

const moreLinks = [
  { href: "/replies", label: "Replies", icon: MessageSquareReply },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/connect-inbox", label: "Inbox", icon: Mail },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string | null, href: string) {
  return pathname === href || pathname?.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [mailProvider, setMailProvider] = useState<string | null>(null);
  const [demoEmail, setDemoEmail] = useState("");

  useEffect(() => {
    if (allowDemoFallback()) {
      const demo = getDemoSession();
      if (demo) {
        setDemoEmail(demo.email);
        setGmailConnected(demo.gmailConnected);
      }
      return;
    }
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setGmailConnected(
          !!json.user?.gmailConnected || !!json.user?.mailConnected
        );
        setMailProvider(json.user?.mailProvider || null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, pathname]);

  const displayEmail =
    session?.user?.email || (allowDemoFallback() ? demoEmail : "") || "";
  const connected = gmailConnected;
  const isGmail = !mailProvider || mailProvider === "gmail";
  const moreActive = moreLinks.some((l) => isActive(pathname, l.href));

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLogo height={26} priority />

          <nav className="hidden items-center gap-0.5 md:flex">
            {primaryLinks.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    buttonVariants({
                      variant: active ? "secondary" : "ghost",
                      size: "sm",
                    }),
                    "gap-1.5"
                  )}
                >
                  <Icon className="size-3.5 opacity-70" />
                  {label}
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({
                    variant: moreActive ? "secondary" : "ghost",
                    size: "sm",
                  }),
                  "gap-1.5"
                )}
              >
                <MoreHorizontal className="size-3.5 opacity-70" />
                More
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {moreLinks.map(({ href, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={href}
                    className="cursor-pointer gap-2"
                    onClick={() => router.push(href)}
                  >
                    <Icon className="size-4 opacity-70" />
                    {label}
                    {isActive(pathname, href) ? (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        ·
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => {
                    if (allowDemoFallback()) {
                      router.push("/login");
                      return;
                    }
                    void signOut({ callbackUrl: "/login" });
                  }}
                >
                  {status === "authenticated" ? "Sign out" : "Account"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {displayEmail && (
            <Link href="/connect-inbox" className="hidden sm:block">
              <Badge
                variant={connected ? "secondary" : "outline"}
                className="max-w-[200px] truncate font-normal"
              >
                {connected
                  ? `${isGmail ? "Gmail" : "Inbox"} connected`
                  : "Connect inbox"}
              </Badge>
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              if (allowDemoFallback()) {
                router.push("/login");
                return;
              }
              void signOut({ callbackUrl: "/login" });
            }}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "hidden md:inline-flex"
            )}
          >
            {status === "authenticated" ? "Sign out" : "Account"}
          </button>
        </div>
      </div>

      {/* Mobile: compact horizontal scroll of primary + key secondary */}
      <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-3 py-1.5 md:hidden">
        {[...primaryLinks, ...moreLinks.slice(0, 4)].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              buttonVariants({
                size: "xs",
                variant: isActive(pathname, href) ? "secondary" : "ghost",
              }),
              "shrink-0 whitespace-nowrap"
            )}
          >
            {label}
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ size: "xs", variant: "ghost" }),
              "shrink-0"
            )}
          >
            More
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {moreLinks.slice(4).map(({ href, label }) => (
              <DropdownMenuItem
                key={href}
                className="cursor-pointer"
                onClick={() => router.push(href)}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}
