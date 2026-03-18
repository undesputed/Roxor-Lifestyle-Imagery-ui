import nextAuthMiddleware from "next-auth/middleware";

export default nextAuthMiddleware;

export const config = {
  // Protect all routes except:
  //   /login              — the sign-in page itself
  //   /api/auth/*         — NextAuth callback / CSRF endpoints
  //   /_next/*            — Next.js internals (static files, HMR, etc.)
  //   /favicon.ico        — browser favicon request
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
