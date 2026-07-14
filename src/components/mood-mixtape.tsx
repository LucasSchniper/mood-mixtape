"use client";

import { useEffect, useState } from "react";
import { Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Song } from "@/lib/types";

type Pick = {
  id: string;
  reason: string;
  song?: Song;
};

type Result = {
  playlistName: string;
  intro: string;
  picks: Pick[];
};

function AlbumCover({ song }: { song: Song }) {
  const [errored, setErrored] = useState(false);

  if (!song.coverUrl || errored) {
    return (
      <div className="aspect-square w-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
        <Music className="h-8 w-8 text-primary/50" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={song.coverUrl}
      alt={`Portada de ${song.title} — ${song.artist}`}
      className="aspect-square w-full object-cover"
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}

const ALL_EXAMPLES = [
  "lluvia, domingo a la tarde, nostalgia",
  "arrancando el gimnasio, quiero energía",
  "manejando de noche por la ruta, solo",
  "recién cortamos, necesito llorar un rato",
  "previa con amigos, mucha fiesta",
  "estudiando para el final, necesito concentrarme",
  "viaje en auto por la ruta, verano",
  "domingo tranquilo, quiero relajarme",
  "estoy re enamorado, quiero algo romántico",
  "tengo bronca, necesito descargar",
  "asado con la familia, rock nacional",
  "tarde de invierno, café y lectura",
];

const DEFAULT_EXAMPLES = ALL_EXAMPLES.slice(0, 4);

function pickRandomExamples(count: number) {
  const shuffled = [...ALL_EXAMPLES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function MoodMixtape() {
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [examples, setExamples] = useState(DEFAULT_EXAMPLES);

  useEffect(() => {
    setExamples(pickRandomExamples(4));
  }, []);

  async function generate(promptOverride?: string) {
    const finalMood = (promptOverride ?? mood).trim();
    if (!finalMood) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/generate-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: finalMood }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Algo salió mal.");
        return;
      }

      setResult(data);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 card-glass p-4 sm:p-5 shadow-[0_0_40px_-16px_var(--glow-primary)]">
        <Textarea
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          placeholder="Contame tu mood... ej: 'lluvia, domingo a la tarde, nostalgia'"
          className="min-h-24 text-base bg-input/40 border-border/60 focus-visible:ring-primary/40 focus-visible:border-primary/50"
          maxLength={300}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              generate();
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setMood(ex);
                generate(ex);
              }}
              className="text-xs px-3 py-1 rounded-full border border-primary/25 bg-primary/5 text-muted-foreground hover:border-accent/50 hover:bg-accent/10 hover:text-accent-foreground/90 hover:text-foreground transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button
          onClick={() => generate()}
          disabled={loading || !mood.trim()}
          size="lg"
          className="self-start"
        >
          {loading ? "Armando tu playlist..." : "Generar playlist"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl bg-secondary/60" />
          ))}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-gradient">
              {result.playlistName}
            </h2>
            {result.intro && (
              <p className="text-muted-foreground mt-1">{result.intro}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.picks.map((pick) => (
              <Card
                key={pick.id}
                className="overflow-hidden py-0 gap-0 card-glass border border-primary/15 ring-0 hover:border-primary/40 hover:shadow-[0_0_32px_-10px_var(--glow-primary)] transition-all duration-300"
              >
                {pick.song && <AlbumCover song={pick.song} />}
                <CardHeader className="pt-4">
                  {pick.song && (
                    <>
                      <CardTitle className="text-base leading-tight">
                        {pick.song.title}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{pick.song.artist}</p>
                    </>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">{pick.reason}</p>
                </CardHeader>
                {pick.song && (
                  <>
                    <CardContent className="pb-3 flex flex-wrap gap-1.5">
                      {pick.song.moods.map((m) => (
                        <Badge
                          key={m}
                          variant="secondary"
                          className="text-xs bg-accent/10 text-accent border border-accent/25"
                        >
                          {m}
                        </Badge>
                      ))}
                    </CardContent>
                    <div className="px-6 pb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <a
                        href={`https://open.spotify.com/search/${encodeURIComponent(
                          `${pick.song.title} ${pick.song.artist}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:text-primary transition-colors hover:underline"
                      >
                        Spotify ↗
                      </a>
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                          `${pick.song.title} ${pick.song.artist}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:text-primary transition-colors hover:underline"
                      >
                        YouTube ↗
                      </a>
                      <a
                        href={`https://music.apple.com/us/search?term=${encodeURIComponent(
                          `${pick.song.title} ${pick.song.artist}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:text-primary transition-colors hover:underline"
                      >
                        Apple Music ↗
                      </a>
                    </div>
                  </>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
