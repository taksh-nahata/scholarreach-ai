import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a name, valid email, and password (8+ characters)." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in instead." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);

    if (existing) {
      // Claim legacy passwordless account (e.g. seeded) by setting password
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          passwordHash,
        },
      });
      return NextResponse.json({
        ok: true,
        email,
        claimed: true,
        message: "Password set on existing workspace. You can sign in now.",
      });
    }

    await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash,
        onboardingComplete: false,
      },
    });

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
