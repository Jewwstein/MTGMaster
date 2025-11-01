import NextAuth, { type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "./prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Username",
      credentials: {
        username: { label: "Username", type: "text" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        if (!username) return null;
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) return { id: existing.id, name: existing.username } as any;
        const created = await prisma.user.create({ data: { username } });
        return { id: created.id, name: created.username } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        session.user.name = token.name as string | null;
      }
      return session;
    },
  },
};

export const { auth } = NextAuth(authOptions);
