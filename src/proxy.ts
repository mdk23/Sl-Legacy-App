import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/api/migrate(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/support(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)"
]);

export default clerkMiddleware(async () => {
  // Allow all routes directly without login redirects
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
