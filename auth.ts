import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

const admins = (process.env.ADMIN_DISCORD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const { handlers, auth } = NextAuth({
  providers: [Discord],
  callbacks: {
    session({ session, token }) {
      (session.user as { isAdmin?: boolean }).isAdmin = admins.includes(String(token.sub));
      return session;
    },
  },
});
