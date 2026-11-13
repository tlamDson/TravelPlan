/**
 * Hero Section Component
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HERO_IMAGE, DESTINATION_CARDS } from "../constants";

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />
      </div>

      {/* Floating destination cards */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
        {DESTINATION_CARDS.map((dest, i) => (
          <div
            key={dest.city}
            className="absolute rounded-xl p-2 bg-card/90 backdrop-blur shadow-lg hidden lg:block"
            style={{
              left: `${15 + i * 30}%`,
              top: `${30 + (i % 2) * 20}%`,
              animation: `float 3s ease-in-out infinite`,
              animationDelay: `${dest.delay * 0.5}s`,
            }}
          >
            <img
              src={dest.image}
              alt={dest.city}
              className="w-24 h-16 object-cover rounded-lg"
            />
            <p className="text-xs font-medium mt-1">{dest.city}</p>
            <p className="text-xs text-muted-foreground">{dest.country}</p>
          </div>
        ))}
      </div>

      <div className="container mx-auto px-4 relative z-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Plan Your Perfect Journey with{" "}
            <span className="text-primary">AI</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Intelligent travel planning powered by AI. Create itineraries,
            discover hidden gems, and manage your budget—all in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup">
              <Button size="lg">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              data-testid="hero-how-it-works-cta"
              onClick={() =>
                document
                  .getElementById("how-it-works")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See How It Works
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            Join 10,000+ travelers planning smarter trips
          </p>
        </div>
      </div>
    </section>
  );
}
