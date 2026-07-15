import { NextRequest, NextResponse } from "next/server";
import songs from "@/data/songs.json";
import type { Song } from "@/lib/types";

export const runtime = "nodejs";

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .trim();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matchea `needle` como palabra/frase completa dentro de `haystack` (ambos ya normalizados),
// para no confundir "rock" suelto con "rock nacional", o "sola" con "solamente".
function containsWord(haystack: string, needle: string) {
  if (!needle) return false;
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(haystack);
}

// Palabras/frases en español (o inglés) del usuario -> tags canónicos usados en el catálogo (moods en inglés).
const MOOD_SYNONYMS: Record<string, string[]> = {
  nostalgia: ["nostalgic"],
  nostalgico: ["nostalgic"],
  nostalgica: ["nostalgic"],
  lluvia: ["rainy day", "melancholic"],
  lluvioso: ["rainy day"],
  domingo: ["rainy day", "chill", "nostalgic"],
  triste: ["heartbreak", "melancholic", "sad"],
  tristeza: ["heartbreak", "melancholic", "sad"],
  llorar: ["heartbreak", "sad"],
  "corazon roto": ["heartbreak"],
  ruptura: ["heartbreak"],
  cortamos: ["heartbreak"],
  gimnasio: ["gym", "energetic"],
  entrenar: ["gym", "energetic"],
  entrenamiento: ["gym", "energetic"],
  energia: ["energetic", "upbeat"],
  fiesta: ["party", "upbeat"],
  previa: ["party", "upbeat"],
  boliche: ["party"],
  noche: ["night drive"],
  manejando: ["night drive", "road trip"],
  manejar: ["night drive", "road trip"],
  auto: ["road trip", "night drive"],
  ruta: ["road trip", "night drive"],
  viaje: ["road trip"],
  viajando: ["road trip"],
  solo: ["melancholic", "night drive"],
  sola: ["melancholic", "night drive"],
  relax: ["chill"],
  relajado: ["chill"],
  tranquilo: ["chill"],
  tranquila: ["chill"],
  estudiar: ["study/focus", "chill"],
  concentrar: ["study/focus"],
  concentracion: ["study/focus"],
  foco: ["study/focus"],
  trabajar: ["study/focus", "chill"],
  romance: ["romantic"],
  amor: ["romantic"],
  enamorado: ["romantic"],
  enamorada: ["romantic"],
  cita: ["romantic"],
  verano: ["summer", "upbeat"],
  calor: ["summer"],
  playa: ["summer"],
  bronca: ["angsty"],
  enojo: ["angsty"],
  enojado: ["angsty"],
  enojada: ["angsty"],
  furioso: ["angsty"],
  furiosa: ["angsty"],
  bardo: ["angsty"],
};

const TAG_LABELS_ES: Record<string, string> = {
  heartbreak: "corazón roto",
  "road trip": "viaje en ruta",
  gym: "gimnasio",
  "rainy day": "día de lluvia",
  nostalgic: "nostalgia",
  party: "fiesta",
  chill: "relax",
  melancholic: "melancolía",
  romantic: "romance",
  angsty: "bronca",
  summer: "verano",
  "night drive": "manejar de noche",
  "study/focus": "concentración",
  energetic: "energía",
  upbeat: "buena onda",
  sad: "tristeza",
  winter: "invierno",
};

function labelFor(tag: string) {
  return TAG_LABELS_ES[tag] ?? tag;
}

function extractSignals(moodText: string) {
  const normalized = normalize(moodText);
  const tokens = normalized.split(/[^a-z0-9/]+/).filter(Boolean);
  const tokenSet = new Set(tokens);

  const matchedTags = new Set<string>();
  for (const [phrase, tags] of Object.entries(MOOD_SYNONYMS)) {
    if (containsWord(normalized, phrase)) {
      tags.forEach((t) => matchedTags.add(t));
    }
  }
  // También permite que el usuario escriba el tag directamente en inglés.
  for (const tag of Object.keys(TAG_LABELS_ES)) {
    if (containsWord(normalized, tag)) matchedTags.add(tag);
  }

  let desiredEnergy: number | null = null;
  const highEnergyHit = ["energia", "gimnasio", "entrenar", "fiesta", "previa", "boliche"].some((w) =>
    containsWord(normalized, w)
  );
  const lowEnergyHit = ["triste", "llorar", "relax", "tranquilo", "tranquila", "lluvia", "domingo"].some(
    (w) => containsWord(normalized, w)
  );
  if (highEnergyHit && !lowEnergyHit) desiredEnergy = 9;
  else if (lowEnergyHit && !highEnergyHit) desiredEnergy = 3;

  return { tokenSet, matchedTags, desiredEnergy };
}

// Los créditos con feats ("Lady Gaga, Bruno Mars", "ROSALÍA & Rauw Alejandro",
// "Sech feat. Daddy Yankee") se guardan como un solo string; los partimos para
// reconocer a cada artista individualmente.
function splitArtists(artistField: string) {
  return artistField
    .split(/,|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/i)
    .map((a) => a.trim())
    .filter(Boolean);
}

// Busca artistas del catálogo mencionados por nombre en el mood ("playlist de Bruno Mars").
function findRequestedArtists(moodText: string, catalog: Song[]) {
  const normalizedMood = normalize(moodText);
  const atomicArtists = new Set<string>();
  for (const song of catalog) {
    splitArtists(song.artist).forEach((a) => atomicArtists.add(a));
  }
  const matched = new Set<string>();
  for (const artist of atomicArtists) {
    if (containsWord(normalizedMood, normalize(artist))) matched.add(artist);
  }
  return matched;
}

function buildReason(matchedOn: Set<string>, genre: string) {
  const artistMatch = Array.from(matchedOn).find((m) => m.startsWith("artist:"));
  if (artistMatch) return `Es de ${artistMatch.slice("artist:".length)}.`;

  const labels = Array.from(matchedOn).slice(0, 2).map(labelFor);
  return labels.length > 0
    ? `Coincide en ${labels.join(" y ")}.`
    : `Buena opción de ${genre} para variar.`;
}

// Palabras de relleno del prompt ("quiero", "una playlist de", ...) que le restan precisión
// a la búsqueda en iTunes si se manda la oración completa tal cual.
const SEARCH_STOPWORDS = new Set([
  "quiero", "quisiera", "busco", "dame", "dime", "pon", "ponme", "poneme", "hazme", "haceme",
  "arma", "armame", "necesito", "una", "un", "unos", "unas", "el", "la", "los", "las", "de",
  "del", "al", "para", "por", "con", "en", "y", "o", "que", "algo", "tipo", "estilo", "onda",
  "mood", "vibe", "canciones", "cancion", "musica", "playlist", "mixtape", "escuchar", "temas",
  "tema",
]);

// Limpia el mood a una consulta más precisa para la búsqueda de texto libre en iTunes
// (ej. "quiero una playlist de Rosalía" -> "rosalia"). Sirve sobre todo para pedidos
// de artista/canción puntual; para pedidos de género usamos extractGenreSearchTerm.
function buildFreeTextSearchTerm(moodText: string) {
  const words = normalize(moodText)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !SEARCH_STOPWORDS.has(w));
  const cleaned = words.join(" ").trim();
  return cleaned.length >= 2 ? cleaned : moodText;
}

// Formas coloquiales de referirse a un género del catálogo que no coinciden textualmente
// con el nombre exacto que usamos como tag (ej. la gente dice "rock argentino" mucho más
// seguido que "rock nacional", pero en el catálogo el género se llama "rock nacional").
const GENRE_ALIASES: Record<string, string> = {
  "rock argentino": "rock nacional",
  "rock del pais": "rock nacional",
};

// Agrega al texto normalizado el nombre canónico del género cuando se detecta un alias,
// para que el resto de la lógica (búsqueda en iTunes, scoring, labels) siga matcheando
// contra los tags reales del catálogo sin tener que duplicar esta lista en todos lados.
function withGenreAliases(normalizedMood: string) {
  let result = normalizedMood;
  for (const [alias, canonical] of Object.entries(GENRE_ALIASES)) {
    if (containsWord(normalizedMood, alias)) result += ` ${canonical}`;
  }
  return result;
}

// Si el mood menciona un género del catálogo ("...un concierto de rock"), lo devolvemos
// solo (ej. "rock") para que la búsqueda en iTunes no se ensucie con verbos/relleno
// ("armame un setlist de un concierto de rock" solía no traer ningún resultado).
function extractGenreSearchTerm(moodText: string, catalog: Song[]) {
  const normalizedMood = withGenreAliases(normalize(moodText));
  const genres = Array.from(new Set(catalog.map((s) => s.genre)));
  const matches = genres
    .filter((g) => containsWord(normalizedMood, normalize(g)))
    .sort((a, b) => normalize(b).split(/\s+/).length - normalize(a).split(/\s+/).length);
  return matches[0] ?? null;
}

type ItunesTrack = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
};

async function fetchItunesTracks(term: string): Promise<ItunesTrack[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      term
    )}&media=music&entity=song&limit=25&country=AR`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    // Timeout, red caída, etc: seguimos solo con el catálogo local.
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// Complementa el catálogo curado con resultados en vivo de la iTunes Search API
// (misma fuente ya usada para portadas/previews, gratis y sin API key) para cubrir
// artistas o géneros que no están en nuestra selección local de 175 canciones.
// Buscamos en paralelo por el género detectado (si hay) y por el texto libre, así
// no perdemos ni los pedidos de género ("un concierto de rock") ni los de artista
// ("playlist de Rosalía").
async function searchItunesCandidates(query: string, catalog: Song[]): Promise<Song[]> {
  if (!query.trim()) return [];

  const terms = new Set<string>();
  const genreTerm = extractGenreSearchTerm(query, catalog);
  if (genreTerm) terms.add(genreTerm);
  terms.add(buildFreeTextSearchTerm(query));

  const resultLists = await Promise.all(Array.from(terms).map(fetchItunesTracks));

  const seenIds = new Set<number>();
  const merged: Song[] = [];
  for (const list of resultLists) {
    for (const t of list) {
      if (!t.trackId || !t.trackName || !t.artistName || seenIds.has(t.trackId)) continue;
      seenIds.add(t.trackId);
      merged.push({
        id: `itunes-${t.trackId}`,
        title: t.trackName,
        artist: t.artistName,
        moods: [],
        genre: (t.primaryGenreName ?? "").toLowerCase(),
        energy: 5,
        coverUrl: t.artworkUrl100?.replace("100x100bb", "600x600bb"),
      });
    }
  }
  return merged;
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const MIN_SONGS = 6;
const MAX_SONGS = 30;

export async function POST(req: NextRequest) {
  let mood: string;
  let count: number;
  try {
    const body = await req.json();
    mood = String(body?.mood ?? "").trim();
    const rawCount = Number(body?.count);
    count = Number.isFinite(rawCount)
      ? Math.min(MAX_SONGS, Math.max(MIN_SONGS, Math.round(rawCount)))
      : 8;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (!mood) {
    return NextResponse.json({ error: "Contame tu mood primero." }, { status: 400 });
  }
  if (mood.length > 300) {
    return NextResponse.json({ error: "Mood demasiado largo (máx 300 caracteres)." }, { status: 400 });
  }

  const catalog = songs as Song[];

  // Sumamos resultados en vivo de iTunes para artistas/géneros que el catálogo
  // curado no cubre. Si la búsqueda falla, seguimos solo con el catálogo local.
  const localKeys = new Set(
    catalog.map((s) => `${normalize(s.title)}::${normalize(s.artist)}`)
  );
  const itunesResults = await searchItunesCandidates(mood, catalog);
  const seenExternalKeys = new Set<string>();
  const externalSongs = itunesResults.filter((s) => {
    const key = `${normalize(s.title)}::${normalize(s.artist)}`;
    if (localKeys.has(key) || seenExternalKeys.has(key)) return false;
    seenExternalKeys.add(key);
    return true;
  });
  const allSongs = [...catalog, ...externalSongs];

  const { tokenSet, matchedTags, desiredEnergy } = extractSignals(mood);
  const normalizedMood = withGenreAliases(normalize(mood));
  // Solo buscamos artistas pedidos en el catálogo curado. Si mirásemos también los
  // resultados de iTunes caeríamos en un falso positivo autorreferencial: como esos
  // resultados vienen de buscar el propio texto del mood, siempre aparece algún track
  // o artista que se llama igual al término buscado (ej. buscar "rock nacional" trae
  // una banda literalmente llamada "Rock Nacional"), y eso se malinterpretaba como
  // "el usuario pidió este artista" en vez de reconocer el género.
  const requestedArtists = findRequestedArtists(mood, catalog);

  const ARTIST_MATCH_BONUS = 50;
  const GENRE_MATCH_WEIGHT = 3;

  const scored = allSongs.map((song) => {
    let score = 0;
    const matchedOn = new Set<string>();

    const songArtists = splitArtists(song.artist);
    const matchedArtists = songArtists.filter((a) => requestedArtists.has(a));
    if (matchedArtists.length > 0) {
      score += ARTIST_MATCH_BONUS;
      matchedOn.add(`artist:${matchedArtists.join(", ")}`);
    }

    for (const rawTag of song.moods) {
      const tag = normalize(rawTag);
      if (matchedTags.has(tag)) {
        score += 3;
        matchedOn.add(rawTag);
        continue;
      }
      const tagWords = tag.split(/[^a-z0-9]+/).filter(Boolean);
      const overlap = tagWords.filter((w) => tokenSet.has(w));
      if (overlap.length > 0) {
        score += overlap.length;
        matchedOn.add(rawTag);
      }
    }

    // Los géneros de dos palabras ("rock nacional") deben pesar más que su raíz genérica
    // ("rock") para que una búsqueda específica no se llene de matches sueltos.
    const normalizedGenre = normalize(song.genre);
    if (containsWord(normalizedMood, normalizedGenre)) {
      const genreWordCount = normalizedGenre.split(/\s+/).filter(Boolean).length;
      score += genreWordCount * GENRE_MATCH_WEIGHT;
      matchedOn.add(song.genre);
    }

    if (desiredEnergy !== null) {
      score += Math.max(0, 2 - Math.abs(song.energy - desiredEnergy) * 0.3);
    }

    return { song, score, matchedOn };
  });

  const hasAnyMatch = scored.some((s) => s.score >= 1);

  let ranked = [...scored].sort((a, b) => b.score - a.score);
  if (!hasAnyMatch) {
    // Sin coincidencias de texto: devolvemos variedad pareja de energía en vez de nada.
    ranked = [...scored].sort((a, b) => a.song.energy - b.song.energy || b.score - a.score);
    const step = Math.max(1, Math.floor(ranked.length / 8));
    ranked = ranked.filter((_, i) => i % step === 0);
  }

  // Mezclamos entre los mejores matches para que generar de nuevo con el mismo
  // mood no siempre tire la misma playlist, sin perder relevancia.
  const POOL_SIZE = Math.max(24, count * 3);
  // Barajamos para variedad, pero re-ordenamos por score (sort es estable) para que
  // los matches fuertes (ej. artista pedido explícitamente) no queden afuera del corte.
  const primaryPool = shuffle(ranked.slice(0, Math.min(POOL_SIZE, ranked.length))).sort(
    (a, b) => b.score - a.score
  );
  // Sin shuffle: si hay que rellenar, priorizamos los siguientes mejores matches en vez de azar puro.
  const backfillPool = ranked;

  const picks: { id: string; reason: string; song: Song }[] = [];
  const usedArtists = new Map<string, number>();
  for (const entry of primaryPool) {
    if (picks.length >= count) break;
    // Si el usuario pidió este artista explícitamente, no lo limitamos a 2 canciones.
    const isRequestedArtist = splitArtists(entry.song.artist).some((a) => requestedArtists.has(a));
    const artistCount = usedArtists.get(entry.song.artist) ?? 0;
    if (!isRequestedArtist && artistCount >= 2) continue;
    usedArtists.set(entry.song.artist, artistCount + 1);

    picks.push({ id: entry.song.id, reason: buildReason(entry.matchedOn, entry.song.genre), song: entry.song });
  }

  if (picks.length < count) {
    for (const entry of backfillPool) {
      if (picks.length >= count) break;
      if (picks.some((p) => p.id === entry.song.id)) continue;
      picks.push({
        id: entry.song.id,
        reason: buildReason(entry.matchedOn, entry.song.genre),
        song: entry.song,
      });
    }
  }

  const matchedGenres = Array.from(new Set(allSongs.map((s) => s.genre).filter(Boolean)))
    .filter((g) => containsWord(normalizedMood, normalize(g)))
    .sort((a, b) => normalize(b).split(/\s+/).length - normalize(a).split(/\s+/).length);

  const topLabels = [...Array.from(matchedTags).map(labelFor), ...matchedGenres].slice(0, 2);

  let playlistName: string;
  let intro: string;
  if (requestedArtists.size > 0) {
    const artistList = Array.from(requestedArtists).join(" y ");
    playlistName = `Playlist de ${artistList}`;
    intro =
      topLabels.length > 0
        ? `Lo que encontramos de ${artistList}, con foco en ${topLabels.join(" y ")}.`
        : `Lo que encontramos de ${artistList}.`;
  } else if (topLabels.length > 0) {
    playlistName = `Mixtape de ${topLabels.join(" y ")}`;
    intro = `Armada a partir de tu mood, con foco en ${topLabels.join(" y ")}.`;
  } else {
    playlistName = "Tu Mood Mixtape";
    intro = `Una selección variada para "${mood}".`;
  }

  return NextResponse.json({ playlistName, intro, picks });
}
