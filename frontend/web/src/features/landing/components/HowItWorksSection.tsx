/**
 * How It Works Section Component
 */

import { ChevronRight } from "lucide-react";
import { STEPS } from "../constants";

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Get started in minutes and plan your dream trip with ease.
          </p>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          {STEPS.map((item, index) => (
            <div key={item.step} className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
              {index < STEPS.length - 1 && (
                <ChevronRight className="hidden md:block absolute top-6 -right-3 h-6 w-6 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
