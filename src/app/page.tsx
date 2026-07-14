import { Sparkles } from "lucide-react";
import { MoodMixtape } from "@/components/mood-mixtape";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-16 gap-12">
      <div className="text-center flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary/90 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />
          impulsado por IA
        </span>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gradient animate-gradient">
          Mood Mixtape
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Describí tu mood y una IA arma una playlist para vos, al toque.
        </p>
      </div>
      <MoodMixtape />
    </main>
  );
}
