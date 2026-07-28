import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                scope:
                  "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.readonly",
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      id: "dev-login",
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email =
          credentials?.email ||
          process.env.DEFAULT_USER_EMAIL ||
          "takshnahata37@gmail.com";
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name: process.env.DEFAULT_USER_NAME || "Taksh Nahata",
          },
        });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const dbUser = await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name || undefined,
          image: user.image || undefined,
        },
        create: {
          email: user.email,
          name: user.name || null,
          image: user.image || null,
        },
      });

      if (account?.provider === "google") {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            googleAccessToken: account.access_token || null,
            googleRefreshToken: account.refresh_token || undefined,
            googleTokenExpiry: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            gmailConnected: !!(account.access_token || account.refresh_token),
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
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};
