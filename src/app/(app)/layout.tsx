import { AppNav } from "@/app/components/AppNav";

// Live app must be dynamic for NextAuth sessions. Static export still works via Pages build.
export const dynamic =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? "force-static" : "force-dynamic";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <AppNav />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
