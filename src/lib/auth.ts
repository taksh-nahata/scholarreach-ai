import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/** Identity-only Google scopes — works with Family Link supervised accounts */
const GOOGLE_SIGNIN_SCOPES = "openid email profile";

async function authorizePassword(credentials: {
  email?: string;
  password?: string;
} | undefined) {
  const email = (credentials?.email || "").trim().toLowerCase();
  const password = credentials?.password || "";
  if (!email || !email.includes("@") || !password) return null;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name };
}

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                // Identity only for login — Gmail send is a separate connect step
                scope: GOOGLE_SIGNIN_SCOPES,
                prompt: "select_account",
              },
            },
          }),
        ]
      : []),
    ...(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
      ? [
          AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
            tenantId: process.env.AZURE_AD_TENANT_ID || "common",
            authorization: {
              params: {
                scope:
                  "openid email profile offline_access https://graph.microsoft.com/Mail.Send",
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        return authorizePassword(credentials);
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const email = user.email.toLowerCase();

      const dbUser = await prisma.user.upsert({
        where: { email },
        update: {
          name: user.name || undefined,
          image: user.image || undefined,
        },
        create: {
          email,
          name: user.name || null,
          image: user.image || null,
        },
      });

      if (account?.provider === "google") {
        // Identity login only — NEVER write/clobber Gmail mail tokens here.
        // Mail tokens are set exclusively by /api/mail/gmail/callback after send+read scopes.
      }

      if (account?.provider === "azure-ad") {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            microsoftAccessToken: account.access_token || null,
            microsoftRefreshToken: account.refresh_token || undefined,
            microsoftTokenExpiry: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            mailProvider: "outlook",
            mailConnected: !!(account.access_token || account.refresh_token),
            gmailConnected: false,
          },
        });
      }

      user.id = dbUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      if (user?.email) token.email = user.email;
      if (!token.uid && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
        });
        if (dbUser) token.uid = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
