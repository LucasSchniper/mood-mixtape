import { MoodMixtape } from "@/components/mood-mixtape";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-16 gap-12">
      <div className="text-center flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">🎧 Mood Mixtape</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Describí tu mood y una IA arma una playlist para vos, al toque.
        </p>
      </div>
      <MoodMixtape />
    </main>
  );
}
