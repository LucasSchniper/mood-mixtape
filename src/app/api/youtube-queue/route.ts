import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type QueueSong = { title: string; artist: string };

const MAX_SONGS = 30;
const VIDEO_ID_RE = /"videoId":"([a-zA-Z0-9_-]{11})"/;

// Busca el primer resultado de video para "título artista" leyendo directamente la
// página pública de resultados de YouTube (sin API key ni cuenta de Google: es la
// misma página que ve cualquiera sin loguearse). YouTube embebe los resultados como
// JSON dentro del HTML; el primer "videoId" que aparece es el primer resultado.
async function findVideoId(song: QueueSong): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const query = encodeURIComponent(`${song.title} ${song.artist}`);
    const res = await fetch(`https://www.youtube.com/results?search_query=${query}`, {
      signal: controller.signal,
      headers: { "Accept-Language": "es-AR,es;q=0.9,en;q=0.8" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.match(VIDEO_ID_RE)?.[1] ?? null;
  } catch {
    // Timeout, cambios en el formato de la página de YouTube, etc.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isQueueSong(value: unknown): value is QueueSong {
  const s = value as QueueSong;
  return !!s && typeof s.title === "string" && typeof s.artist === "string";
}

export async function POST(req: NextRequest) {
  let songs: QueueSong[];
  try {
    const body = await req.json();
    songs = Array.isArray(body?.songs) ? body.songs.filter(isQueueSong).slice(0, MAX_SONGS) : [];
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (songs.length === 0) {
    return NextResponse.json({ error: "No hay canciones para buscar." }, { status: 400 });
  }

  const videoIds = (await Promise.all(songs.map(findVideoId))).filter(
    (id): id is string => id !== null
  );

  return NextResponse.json({ videoIds, notFoundCount: songs.length - videoIds.length });
}
