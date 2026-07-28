import { AppNav } from "@/app/components/AppNav";
import { getDemoBundle } from "@/lib/demo";

export const dynamic = "force-static";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let email = "takshnahata37@gmail.com";
  let gmailConnected = false;

  try {
    if (process.env.STATIC_EXPORT !== "true") {
      const { requireUser } = await import("@/lib/session");
      const user = await requireUser();
      email = user.email;
      gmailConnected = user.gmailConnected;
    } else {
      const demo = getDemoBundle();
      email = demo.user.email;
      gmailConnected = demo.user.gmailConnected;
    }
  } catch {
    const demo = getDemoBundle();
    email = demo.user.email;
  }

  return (
    <div className="min-h-screen">
      <AppNav email={email} gmailConnected={gmailConnected} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
