import posthog from "posthog-js"

posthog.init("phc_yAshPRA7kVY4GKm30kh4TSdyKwlbw0PGD2r5T5Tzv5U", {
  api_host: "https://us.i.posthog.com",
  // Include the defaults option as required by PostHog
  defaults: '2026-01-30',
  person_profiles: "always",
  // Enables capturing unhandled exceptions via Error Tracking
  debug: process.env.NODE_ENV === "development",
});

//IMPORTANT: Never combine this approach with other client-side PostHog initialization approaches, especially components like a PostHogProvider. instrumentation-client.ts is the correct solution for initializating client-side PostHog in Next.js 15.3+ apps.
