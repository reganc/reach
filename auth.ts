import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import {
  clientIpFromHeaders,
  recordLoginFailure,
  recordLoginSuccess,
  throttleLogin,
} from "@/lib/auth/login-throttle"

/**
 * A real cost-12 hash of a random string, compared against when no such user
 * exists so that "unknown email" and "wrong password" take the same time.
 * Without it, response latency tells an internet-facing attacker which
 * addresses have accounts. The value is not a secret and never authenticates
 * anything — no password verifies against it.
 */
const ABSENT_USER_HASH = "$2a$12$FRSiDgT/d/MLEO/75MK2TeQAUTyRsRNRi0Dq1IxjYxIEp.7wFBrhC"

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string
        const password = credentials.password as string
        // Forgeable on public ingress, so it only feeds the per-IP ceiling.
        const ip = clientIpFromHeaders(request.headers)

        if (!(await throttleLogin({ email, ip }))) return null

        // The lookup uses the address as typed rather than a normalised form:
        // SQLite compares case-sensitively, so lowercasing here would lock out
        // any account seeded with capitals. Normalisation belongs in the
        // throttle keys, where it already happens.
        const user = await prisma.user.findUnique({ where: { email } })

        // Compare against a decoy when the account is absent, so the two
        // failure modes are indistinguishable by timing. See ABSENT_USER_HASH.
        const valid = await bcrypt.compare(password, user?.password ?? ABSENT_USER_HASH)

        if (!user || !valid) {
          recordLoginFailure({ email, ip })
          return null
        }

        recordLoginSuccess({ email })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as "ADMIN" | "USER",
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: "ADMIN" | "USER" }).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as { role: string }).role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
