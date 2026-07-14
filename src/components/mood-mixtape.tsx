"use client";

import { useState } from "react";
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
      <div className="aspect-square w-full bg-muted flex items-center justify-center">
        <Music className="h-8 w-8 text-muted-foreground/40" />
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

const EXAMPLES = [
  "lluvia, domingo a la tarde, nostalgia",
  "arrancando el gimnasio, quiero energía",
  "manejando de noche por la ruta, solo",
  "recién cortamos, necesito llorar un rato",
];

export function MoodMixtape() {
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

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
      <div className="flex flex-col gap-3">
        <Textarea
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          placeholder="Contame tu mood... ej: 'lluvia, domingo a la tarde, nostalgia'"
          className="min-h-24 text-base"
          maxLength={300}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              generate();
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setMood(ex);
                generate(ex);
              }}
              className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
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
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {result.playlistName}
            </h2>
            {result.intro && (
              <p className="text-muted-foreground mt-1">{result.intro}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.picks.map((pick) => (
              <Card key={pick.id} className="overflow-hidden py-0 gap-0">
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
                        <Badge key={m} variant="secondary" className="text-xs">
                          {m}
                        </Badge>
                      ))}
                    </CardContent>
                    <div className="px-6 pb-4">
                      <a
                        href={`https://open.spotify.com/track/${pick.song.spotifyId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Escuchar en Spotify ↗
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
