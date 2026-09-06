import { clerkMiddleware } from '@clerk/nextjs/server'

// Hii inalinda app yako kiotomatiki kwa kutumia Clerk
export default clerkMiddleware()

export const config = {
  matcher: [
    // Inaruka mafaili yote ya ndani ya Next.js na faili tuli kama picha (static files)
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Inahakikisha API routes zote zinalindwa kila wakati
    '/(api|trpc)(.*)',
  ],
}
