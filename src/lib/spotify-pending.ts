import type { Song } from "@/lib/types";

// La playlist generada se guarda acá antes de mandar al usuario a loguearse con
// Spotify, para poder retomarla en /spotify/callback cuando vuelva con el `code`.
export const PENDING_PLAYLIST_KEY = "spotify_pending_playlist";

export type PendingPlaylist = {
  playlistName: string;
  description: string;
  songs: Song[];
};
