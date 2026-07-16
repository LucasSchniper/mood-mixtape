export type Song = {
  id: string;
  title: string;
  artist: string;
  spotifyId?: string;
  coverUrl?: string;
  moods: string[];
  genre: string;
  energy: number;
  country?: string;
  album?: string;
};

export type PlaylistPick = {
  id: string;
  reason: string;
};

export type PlaylistResponse = {
  playlistName: string;
  intro: string;
  picks: PlaylistPick[];
};
