import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Scissors, Share2 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-[90vh]">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center space-y-12">
        <div className="space-y-6 max-w-5xl">
          <h1 className="text-6xl md:text-9xl font-black tracking-tighter leading-none text-white">
            REPURPOSE<span className="text-cyan-400">.</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-500 font-medium tracking-wide max-w-2xl mx-auto">
            TRANSFORM LONG VIDEOS INTO ENGAGING SHORTS WITH AI.
            <br />
            NO FLUFF. JUST RESULTS.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-md mx-auto">
          <Link href="/upload">
            <Button
              size="lg"
              className="w-full h-16 rounded-none bg-white text-black text-lg font-black uppercase tracking-widest hover:bg-cyan-400 hover:scale-105 transition-all duration-300"
            >
              Start Creating
            </Button>
          </Link>
          <Link href="/studio">
            <Button
              variant="outline"
              size="lg"
              className="w-full h-16 rounded-none border-zinc-800 bg-transparent text-white text-lg font-black uppercase tracking-widest hover:bg-zinc-900 hover:border-zinc-700 transition-all"
            >
              Open Studio
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t border-zinc-900 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-zinc-900">
          {[
            {
              icon: Zap,
              title: "AI Analysis",
              desc: "Gemini identifies viral moments instantly."
            },
            {
              icon: Scissors,
              title: "Smart Crop",
              desc: "Auto-reframing for 9:16 vertical format."
            },
            {
              icon: Share2,
              title: "Viral Ready",
              desc: "Export with captions and effects."
            }
          ].map((feature, i) => (
            <div key={i} className="p-12 group hover:bg-zinc-900/30 transition-colors">
              <feature.icon className="h-8 w-8 text-zinc-700 group-hover:text-cyan-400 transition-colors mb-6" />
              <h3 className="text-2xl font-black tracking-tight text-white mb-2 uppercase">
                {feature.title}
              </h3>
              <p className="text-zinc-500 font-medium">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
