import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function Header() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl items-end justify-between px-6 py-6">
        <Link href="/">
          <a className="group flex items-center gap-2">
            <span className="text-2xl font-black tracking-tighter leading-none text-white">
              CLIPCRAFT<span className="text-cyan-400">.</span>
            </span>
          </a>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { name: "Upload", path: "/upload" },
            { name: "Studio", path: "/studio" },
          ].map((item) => (
            <Link key={item.path} href={item.path}>
              <a
                className={`text-xs font-bold uppercase tracking-widest transition-colors hover:text-cyan-400 ${location === item.path ? "text-cyan-400" : "text-zinc-500"
                  }`}
              >
                {item.name}
              </a>
            </Link>
          ))}

          <Button
            variant="outline"
            className="h-9 rounded-none border-zinc-800 bg-transparent text-xs font-bold uppercase tracking-widest text-white hover:bg-white hover:text-black hover:border-white transition-all"
            onClick={() => window.open("https://github.com", "_blank")}
          >
            GitHub
          </Button>
        </nav>
      </div>
    </header>
  );
}
