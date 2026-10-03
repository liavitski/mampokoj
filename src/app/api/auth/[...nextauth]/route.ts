import NextAuth, { type NextAuthOptions } from 'next-auth';
import Google from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  /**
   * One provider, on purpose.
   *
   * GitHub was dropped because a person signing in with both providers gets two
   * account ids. Everything keys on that id -- `ads.userId`, the slot index that
   * enforces the ad limit, the MODERATORS allowlist -- so two providers meant
   * one person could hold four ads instead of two, which is the limitation §7
   * closes. Fixing it properly means account linking, which is more machinery
   * than this site needs; one provider is the smaller correct answer.
   *
   * The cost is real and worth stating: somebody who only ever signed in with
   * GitHub cannot sign in at all any more, and their existing ads are keyed to
   * an id the site no longer recognises. With one real account that is a
   * deliberate trade, not an oversight.
   */
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // runs on sign in
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};

export const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
