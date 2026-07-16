import type { Song } from "@/lib/types";

async function spotifyFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify API ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

// La mitad del catálogo local ya trae spotifyId cargado; para el resto (y las
// canciones sumadas desde iTunes) buscamos por título+artista en Spotify.
async function resolveTrackUri(token: string, song: Song): Promise<string | null> {
  if (song.spotifyId) return `spotify:track:${song.spotifyId}`;

  const query = encodeURIComponent(`track:${song.title} artist:${song.artist}`);
  const data = await spotifyFetch(token, `/search?q=${query}&type=track&limit=1`);
  const track = data?.tracks?.items?.[0];
  return track ? (track.uri as string) : null;
}

export type CreatePlaylistResult = {
  playlistUrl: string;
  addedCount: number;
  notFound: Song[];
};

export async function createSpotifyPlaylist(
  token: string,
  playlistName: string,
  description: string,
  songs: Song[]
): Promise<CreatePlaylistResult> {
  const me = await spotifyFetch(token, "/me");

  const playlist = await spotifyFetch(token, `/users/${me.id}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name: playlistName || "Mood Mixtape",
      description: description.slice(0, 300),
      public: false,
    }),
  });

  const resolved = await Promise.all(
    songs.map(async (song) => ({ song, uri: await resolveTrackUri(token, song).catch(() => null) }))
  );
  const uris = resolved.filter((r): r is { song: Song; uri: string } => r.uri !== null).map((r) => r.uri);
  const notFound = resolved.filter((r) => r.uri === null).map((r) => r.song);

  if (uris.length > 0) {
    await spotifyFetch(token, `/playlists/${playlist.id}/tracks`, {
      method: "POST",
      body: JSON.stringify({ uris }),
    });
  }

  return {
    playlistUrl: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
    addedCount: uris.length,
    notFound,
  };
}
