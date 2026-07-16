"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { consumeStoredCodeVerifier, exchangeCodeForToken } from "@/lib/spotify-pkce";
import { createSpotifyPlaylist, type CreatePlaylistResult } from "@/lib/spotify-playlist";
import { PENDING_PLAYLIST_KEY, type PendingPlaylist } from "@/lib/spotify-pending";

type Status = "working" | "done" | "error";

function CallbackInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("Conectando con Spotify...");
  const [result, setResult] = useState<CreatePlaylistResult | null>(null);

  useEffect(() => {
    async function run() {
      const error = params.get("error");
      if (error) {
        setStatus("error");
        setMessage("Cancelaste el login o Spotify rechazó el permiso.");
        return;
      }

      const code = params.get("code");
      const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
      const verifier = consumeStoredCodeVerifier();
      const pendingRaw = sessionStorage.getItem(PENDING_PLAYLIST_KEY);

      if (!code || !clientId || !verifier || !pendingRaw) {
        setStatus("error");
        setMessage("Faltan datos para crear la playlist. Volvé a intentar desde el inicio.");
        return;
      }

      sessionStorage.removeItem(PENDING_PLAYLIST_KEY);
      const pending = JSON.parse(pendingRaw) as PendingPlaylist;

      try {
        setMessage("Iniciando sesión...");
        const token = await exchangeCodeForToken(clientId, code, verifier);
        setMessage(`Creando "${pending.playlistName}" en tu Spotify...`);
        const created = await createSpotifyPlaylist(
          token,
          pending.playlistName,
          pending.description,
          pending.songs
        );
        setResult(created);
        setStatus("done");
      } catch {
        setStatus("error");
        setMessage("No se pudo crear la playlist. Probá de nuevo en un rato.");
      }
    }
    run();
    // Solo debe correr una vez al montar: procesa el `code` de un solo uso de la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full flex flex-col items-center gap-4 text-center rounded-2xl border border-primary/20 card-glass p-8">
        {status === "working" && (
          <>
            <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === "done" && result && (
          <>
            <h1 className="text-xl font-semibold text-gradient">¡Playlist creada!</h1>
            <p className="text-muted-foreground">
              Agregamos {result.addedCount} canci{result.addedCount === 1 ? "ón" : "ones"} a tu Spotify.
              {result.notFound.length > 0 &&
                ` No encontramos ${result.notFound.length} en Spotify.`}
            </p>
            <a
              href={result.playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-primary transition-colors hover:underline font-medium"
            >
              Abrir en Spotify ↗
            </a>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Volver a Mood Mixtape
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-xl font-semibold text-destructive">Algo salió mal</h1>
            <p className="text-muted-foreground">{message}</p>
            <Link href="/" className="text-sm text-accent hover:text-primary transition-colors hover:underline">
              Volver a Mood Mixtape
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function SpotifyCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
