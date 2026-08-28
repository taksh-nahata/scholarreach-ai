import { withAuth } from "next-auth/middleware";

/**
 * Protect app shell routes. Static-export builds ignore middleware.
 * Marketing, auth, legal, and public APIs stay open.
 */
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/directory/:path*",
    "/approvals/:path*",
    "/queue/:path*",
    "/replies/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/connect-inbox/:path*",
    "/onboarding/:path*",
  ],
};
