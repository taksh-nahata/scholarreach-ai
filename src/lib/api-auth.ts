/** Shared unauthorized JSON helper for API routes */
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { requireUser } from "@/lib/session";

export async function withAuthUser(
  handler: (user: User) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    return await handler(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (/Unauthorized/i.test(message)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
