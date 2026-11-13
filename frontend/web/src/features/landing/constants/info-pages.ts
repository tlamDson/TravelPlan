/**
 * Copy for the public About / Privacy / Terms pages.
 * Kept short and factual: describes what the app actually does today.
 */

export type InfoPageKey = "about" | "privacy" | "terms";

export interface InfoPageContent {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

export const INFO_PAGES: Record<InfoPageKey, InfoPageContent> = {
  about: {
    title: "About TravelPlan",
    intro:
      "TravelPlan is an AI-assisted travel itinerary planner. Tell us where you are going and what you like, and we build a day-by-day plan.",
    sections: [
      {
        heading: "How it works",
        body: "An AI model suggests places for your trip. Every suggestion is checked against Google Places and Mapbox, grouped by location, and arranged into a realistic daily route.",
      },
      {
        heading: "Verified places",
        body: "AI suggestions are treated as untrusted: a place only appears in your itinerary after it has been verified to exist.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This page explains what TravelPlan stores and which services process it.",
    sections: [
      {
        heading: "What we store",
        body: "Your account details (handled by our sign-in provider, Clerk) and the trips you create: destinations, dates, preferences and the generated itinerary.",
      },
      {
        heading: "Services that process your data",
        body: "Trip details are sent to Google Gemini to generate suggestions, and place names are looked up with Google Places and Mapbox. Data is stored in MongoDB.",
      },
      {
        heading: "Your choices",
        body: "You can delete a trip at any time from your trips page. We do not sell your data.",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro:
      "By creating an account or using TravelPlan you agree to these terms.",
    sections: [
      {
        heading: "Use of the service",
        body: "TravelPlan is provided as is. Use it for planning your own trips and do not misuse or attempt to disrupt the service.",
      },
      {
        heading: "Itineraries are suggestions",
        body: "Itineraries are generated with AI and may contain mistakes. Check opening hours, prices and travel requirements before you rely on them.",
      },
      {
        heading: "Changes",
        body: "We may update the service and these terms. Continued use after a change means you accept the updated terms.",
      },
    ],
  },
};
