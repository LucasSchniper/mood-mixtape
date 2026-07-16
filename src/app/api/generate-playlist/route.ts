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

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Tolerancia a errores de tipeo proporcional al largo de la palabra, para no generar
// falsos positivos entre palabras cortas ("sol" vs "sal").
function fuzzyMaxDistance(len: number) {
  if (len >= 8) return 2;
  if (len >= 5) return 1;
  return 0;
}

// Igual que containsWord pero tolera 1-2 letras de diferencia (typos) contra los
// tokens sueltos del texto del usuario. Solo aplica a palabras simples: las frases
// compuestas ("corazon roto") siguen requiriendo match exacto vía containsWord.
function containsWordFuzzy(tokenSet: Set<string>, needle: string) {
  if (needle.includes(" ")) return false;
  const maxDist = fuzzyMaxDistance(needle.length);
  if (maxDist === 0) return false;
  for (const token of tokenSet) {
    if (Math.abs(token.length - needle.length) > maxDist) continue;
    if (levenshtein(token, needle) <= maxDist) return true;
  }
  return false;
}

// Palabras/frases en español (o inglés) del usuario -> tags canónicos usados en el catálogo (moods en inglés).
// Cubre las 29 tags del catálogo con sinónimos, jerga y variantes de género/número.
const MOOD_SYNONYMS: Record<string, string[]> = {
  // nostalgic
  nostalgia: ["nostalgic"],
  nostalgico: ["nostalgic"],
  nostalgica: ["nostalgic"],
  nostalgicos: ["nostalgic"],
  recuerdos: ["nostalgic"],
  recordar: ["nostalgic"],
  "viejos tiempos": ["nostalgic"],
  antano: ["nostalgic"],
  infancia: ["nostalgic"],
  adolescencia: ["nostalgic"],
  epoca: ["nostalgic"],
  throwback: ["nostalgic"],

  // rainy day / clima / melancholic
  lluvia: ["rainy day", "melancholic"],
  lluvioso: ["rainy day"],
  lluviosa: ["rainy day"],
  llueve: ["rainy day"],
  tormenta: ["rainy day", "moody"],
  nublado: ["rainy day", "melancholic"],
  nube: ["rainy day", "melancholic"],
  gris: ["melancholic", "moody"],
  domingo: ["rainy day", "chill", "nostalgic"],
  otono: ["melancholic", "rainy day"],

  // sad / heartbreak
  triste: ["heartbreak", "melancholic", "sad"],
  tristeza: ["heartbreak", "melancholic", "sad"],
  llorar: ["heartbreak", "sad"],
  lloron: ["heartbreak", "sad"],
  lloraba: ["heartbreak", "sad"],
  deprimido: ["sad", "melancholic"],
  deprimida: ["sad", "melancholic"],
  depre: ["sad", "melancholic"],
  bajon: ["sad", "melancholic"],
  dolor: ["heartbreak", "sad"],
  "corazon roto": ["heartbreak"],
  desamor: ["heartbreak"],
  ruptura: ["heartbreak"],
  cortamos: ["heartbreak"],
  "termine con": ["heartbreak"],
  "me dejo": ["heartbreak"],
  "me dejaron": ["heartbreak"],
  extrano: ["heartbreak", "nostalgic"],
  extranar: ["heartbreak", "nostalgic"],
  "mi ex": ["heartbreak"],

  // gym / energetic
  gimnasio: ["gym", "energetic"],
  entrenar: ["gym", "energetic"],
  entrenamiento: ["gym", "energetic"],
  pesas: ["gym", "energetic"],
  cardio: ["gym", "energetic"],
  rutina: ["gym"],
  ejercicio: ["gym", "energetic"],
  correr: ["gym", "energetic"],
  crossfit: ["gym", "energetic"],
  energia: ["energetic", "upbeat"],
  activo: ["energetic"],
  activa: ["energetic"],
  motivado: ["energetic", "empowering"],
  motivada: ["energetic", "empowering"],
  motivacion: ["energetic", "empowering"],
  subidon: ["energetic", "upbeat"],
  adrenalina: ["energetic", "epic"],
  pilas: ["energetic"],

  // party / upbeat
  fiesta: ["party", "upbeat"],
  previa: ["party", "upbeat"],
  boliche: ["party"],
  festejo: ["party", "upbeat"],
  festejar: ["party", "upbeat"],
  cumple: ["party", "upbeat"],
  cumpleanos: ["party", "upbeat"],
  joda: ["party", "upbeat"],
  bailar: ["party", "upbeat", "groovy"],
  baile: ["party", "upbeat", "groovy"],
  bailable: ["party", "groovy"],
  alegre: ["upbeat"],
  alegria: ["upbeat"],
  feliz: ["upbeat"],
  felicidad: ["upbeat"],
  animado: ["upbeat", "energetic"],
  animada: ["upbeat", "energetic"],
  "buena onda": ["upbeat"],

  // night drive / road trip
  noche: ["night drive"],
  manejando: ["night drive", "road trip"],
  manejar: ["night drive", "road trip"],
  conduciendo: ["night drive", "road trip"],
  auto: ["road trip", "night drive"],
  autopista: ["road trip", "night drive"],
  ruta: ["road trip", "night drive"],
  carretera: ["road trip", "night drive"],
  viaje: ["road trip"],
  viajando: ["road trip"],
  vacaciones: ["road trip", "summer"],
  solo: ["melancholic", "night drive"],
  sola: ["melancholic", "night drive"],

  // chill / study
  relax: ["chill"],
  relajado: ["chill"],
  relajada: ["chill"],
  tranquilo: ["chill"],
  tranquila: ["chill"],
  tranqui: ["chill"],
  descansar: ["chill"],
  lento: ["chill", "smooth"],
  suave: ["chill", "smooth"],
  estudiar: ["study/focus", "chill"],
  concentrar: ["study/focus"],
  concentracion: ["study/focus"],
  concentrado: ["study/focus"],
  concentrada: ["study/focus"],
  foco: ["study/focus"],
  trabajar: ["study/focus", "chill"],
  oficina: ["study/focus"],
  examen: ["study/focus"],
  parcial: ["study/focus"],
  tesis: ["study/focus"],
  leer: ["study/focus", "chill"],

  // romantic / flirty
  romance: ["romantic"],
  amor: ["romantic"],
  enamorado: ["romantic"],
  enamorada: ["romantic"],
  enamorarse: ["romantic"],
  cita: ["romantic"],
  pareja: ["romantic"],
  novio: ["romantic"],
  novia: ["romantic"],
  casamiento: ["romantic"],
  boda: ["romantic"],
  coqueteo: ["flirty", "romantic"],
  coqueto: ["flirty"],
  coqueta: ["flirty"],
  seduccion: ["flirty"],
  picante: ["flirty"],
  levante: ["flirty"],

  // summer / winter
  verano: ["summer", "upbeat"],
  calor: ["summer"],
  playa: ["summer"],
  sol: ["summer", "upbeat"],
  pileta: ["summer"],
  invierno: ["winter"],
  frio: ["winter", "melancholic"],
  nieve: ["winter"],
  abrigo: ["winter"],

  // angsty
  bronca: ["angsty"],
  enojo: ["angsty"],
  enojado: ["angsty"],
  enojada: ["angsty"],
  furioso: ["angsty"],
  furiosa: ["angsty"],
  bardo: ["angsty"],
  rabia: ["angsty"],
  odio: ["angsty"],
  ira: ["angsty"],
  frustracion: ["angsty"],
  frustrado: ["angsty"],
  frustrada: ["angsty"],

  // confident / empowering
  confianza: ["confident"],
  seguro: ["confident"],
  segura: ["confident"],
  poderoso: ["confident", "empowering"],
  poderosa: ["confident", "empowering"],
  empoderada: ["empowering"],
  empoderado: ["empowering"],
  empoderamiento: ["empowering"],
  fuerza: ["empowering"],
  superacion: ["empowering"],
  actitud: ["confident"],

  // epic / moody / psychedelic / punk / indie / groovy / classic rock
  epico: ["epic"],
  epica: ["epic"],
  heroico: ["epic"],
  cinematico: ["epic"],
  grandioso: ["epic"],
  batalla: ["epic"],
  oscuro: ["moody"],
  oscura: ["moody"],
  intenso: ["moody"],
  intensa: ["moody"],
  psicodelico: ["psychedelic"],
  psicodelica: ["psychedelic"],
  trip: ["psychedelic"],
  rebelde: ["punk", "angsty"],
  caotico: ["punk"],
  alternativo: ["indie"],
  under: ["indie"],
  funky: ["groovy"],
  sensual: ["smooth", "flirty"],
  "rock clasico": ["classic rock"],
  "rock de los 80": ["classic rock"],
  "rock de los 70": ["classic rock"],
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
  "classic rock": "rock clásico",
  confident: "confianza",
  empowering: "empoderamiento",
  epic: "épico",
  flirty: "coqueteo",
  groovy: "groove",
  indie: "indie",
  moody: "oscuro",
  psychedelic: "psicodélico",
  punk: "punk",
  smooth: "suave",
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
    if (containsWord(normalized, phrase) || containsWordFuzzy(tokenSet, phrase)) {
      tags.forEach((t) => matchedTags.add(t));
    }
  }
  // También permite que el usuario escriba el tag directamente en inglés.
  for (const tag of Object.keys(TAG_LABELS_ES)) {
    if (containsWord(normalized, tag) || containsWordFuzzy(tokenSet, tag)) matchedTags.add(tag);
  }

  let desiredEnergy: number | null = null;
  const highEnergyWords = [
    "energia", "gimnasio", "entrenar", "entrenamiento", "pesas", "cardio", "ejercicio",
    "correr", "crossfit", "fiesta", "previa", "boliche", "festejo", "festejar", "cumple",
    "joda", "bailar", "baile", "bailable", "motivado", "motivada", "subidon", "adrenalina",
    "activo", "activa", "pilas", "epico", "epica", "batalla",
  ];
  const lowEnergyWords = [
    "triste", "llorar", "relax", "tranquilo", "tranquila", "lluvia", "domingo", "deprimido",
    "deprimida", "depre", "bajon", "descansar", "lento", "suave", "frio", "nublado", "gris",
    "otono", "melancolico", "melancolica",
  ];
  const highEnergyHit = highEnergyWords.some((w) => containsWord(normalized, w) || containsWordFuzzy(tokenSet, w));
  const lowEnergyHit = lowEnergyWords.some((w) => containsWord(normalized, w) || containsWordFuzzy(tokenSet, w));
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

// Palabras de los géneros del catálogo (ej. "punk" de "punk rock"): las excluimos como
// candidatas a nombre distintivo de artista para que "Daft Punk" no se cuele cada vez
// que alguien pide el género "punk rock".
function buildGenreVocab(catalog: Song[]) {
  const vocab = new Set<string>();
  for (const song of catalog) {
    normalize(song.genre)
      .split(/[^a-z0-9]+/)
      .forEach((w) => w && vocab.add(w));
  }
  return vocab;
}

// Busca artistas del catálogo mencionados en el mood, ya sea por nombre completo
// ("playlist de Bruno Mars") o solo por la parte más distintiva del nombre ("playlist
// de Calamaro" -> Andrés Calamaro), que es como la mayoría de la gente nombra artistas
// en español. Devuelve un mapa normalizado -> nombre tal cual aparece en el catálogo.
function findRequestedArtists(moodText: string, catalog: Song[]) {
  const normalizedMood = normalize(moodText);
  const genreVocab = buildGenreVocab(catalog);
  const atomicArtists = new Map<string, string>();
  for (const song of catalog) {
    splitArtists(song.artist).forEach((a) => {
      const key = normalize(a);
      if (!atomicArtists.has(key)) atomicArtists.set(key, a);
    });
  }

  const matched = new Map<string, string>();
  for (const [key, display] of atomicArtists) {
    if (containsWord(normalizedMood, key)) {
      matched.set(key, display);
      continue;
    }
    // El nombre completo no aparece tal cual: probamos con las palabras más distintivas
    // del nombre (largo >= 4, sin contar vocabulario de género) para reconocer menciones
    // parciales típicas en español ("Calamaro", "Charly", "Cerati").
    const words = key.split(/\s+/).filter((w) => w.length >= 4 && !genreVocab.has(w));
    if (words.some((w) => containsWord(normalizedMood, w))) {
      matched.set(key, display);
    }
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
// Buscamos en paralelo por el género detectado (si hay), por el texto libre y por
// cada artista pedido explícitamente (así, si el catálogo local solo tiene 2 temas
// de un artista, completamos con más resultados reales de ese artista en vez de
// rellenar la playlist con canciones de otros).
async function searchItunesCandidates(
  query: string,
  catalog: Song[],
  requestedArtists: string[]
): Promise<Song[]> {
  if (!query.trim()) return [];

  const terms = new Set<string>();
  const genreTerm = extractGenreSearchTerm(query, catalog);
  if (genreTerm) terms.add(genreTerm);
  terms.add(buildFreeTextSearchTerm(query));
  requestedArtists.forEach((a) => terms.add(a));

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

// Interpretación del mood con un LLM gratuito (Google Gemini, capa free de
// Google AI Studio: https://aistudio.google.com/apikey — sin instalar nada,
// solo una API key en GEMINI_API_KEY). Complementa —no reemplaza— el matching
// por reglas de arriba: entiende moods que el diccionario de sinónimos no
// cubre (jerga nueva, frases indirectas, inglés mezclado con español, typos
// raros). Si no hay API key configurada o la llamada falla/tarda de más,
// devolvemos null y seguimos solo con el resultado de extractSignals.
const GEMINI_MODEL = "gemini-2.5-flash";

type LlmMoodSignals = { tags: string[]; energy: number | null };

async function interpretMoodWithGemini(
  mood: string,
  knownTags: string[]
): Promise<LlmMoodSignals | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const prompt = [
      "Interpretá el mood/pedido de un usuario para armar una playlist.",
      `Tags válidos (usá SOLO estos, en inglés, tal cual están escritos): ${knownTags.join(", ")}.`,
      "Devolvé los tags que mejor describan el mood (0 a 5 tags, los más relevantes primero).",
      "Devolvé también un nivel de energía de 1 (muy calmo) a 10 (muy energético) si se puede inferir, o null si no hay pistas de energía.",
      `Mood del usuario: "${mood}"`,
    ].join("\n");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              tags: { type: "array", items: { type: "string" } },
              energy: { type: "integer", nullable: true },
            },
            required: ["tags", "energy"],
          },
        },
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;

    const parsed = JSON.parse(text);
    const knownTagSet = new Set(knownTags);
    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags.filter((t: unknown): t is string => typeof t === "string" && knownTagSet.has(t))
      : [];
    const energy =
      typeof parsed?.energy === "number" && Number.isFinite(parsed.energy)
        ? Math.min(10, Math.max(1, Math.round(parsed.energy)))
        : null;

    return { tags, energy };
  } catch {
    // Timeout, red caída, cuota agotada, JSON inválido, etc: seguimos solo con las reglas.
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  // Solo buscamos artistas pedidos en el catálogo curado. Si mirásemos también los
  // resultados de iTunes caeríamos en un falso positivo autorreferencial: como esos
  // resultados vienen de buscar el propio texto del mood, siempre aparece algún track
  // o artista que se llama igual al término buscado (ej. buscar "rock nacional" trae
  // una banda literalmente llamada "Rock Nacional"), y eso se malinterpretaba como
  // "el usuario pidió este artista" en vez de reconocer el género.
  const requestedArtists = findRequestedArtists(mood, catalog);

  // Sumamos resultados en vivo de iTunes para artistas/géneros que el catálogo
  // curado no cubre. Si la búsqueda falla, seguimos solo con el catálogo local.
  const localKeys = new Set(
    catalog.map((s) => `${normalize(s.title)}::${normalize(s.artist)}`)
  );
  const [itunesResults, llmSignals] = await Promise.all([
    searchItunesCandidates(mood, catalog, Array.from(requestedArtists.values())),
    interpretMoodWithGemini(mood, Object.keys(TAG_LABELS_ES)),
  ]);
  const seenExternalKeys = new Set<string>();
  const externalSongs = itunesResults.filter((s) => {
    const key = `${normalize(s.title)}::${normalize(s.artist)}`;
    if (localKeys.has(key) || seenExternalKeys.has(key)) return false;
    seenExternalKeys.add(key);
    return true;
  });
  const allSongs = [...catalog, ...externalSongs];

  const { tokenSet, matchedTags, desiredEnergy: regexEnergy } = extractSignals(mood);
  // El LLM suma tags/energía cuando las reglas no alcanzan (jerga, frases indirectas,
  // typos raros); las reglas mandan si ya encontraron una energía explícita.
  llmSignals?.tags.forEach((t) => matchedTags.add(t));
  const desiredEnergy = regexEnergy ?? llmSignals?.energy ?? null;
  const normalizedMood = withGenreAliases(normalize(mood));

  const ARTIST_MATCH_BONUS = 50;
  const GENRE_MATCH_WEIGHT = 3;

  const scored = allSongs.map((song) => {
    let score = 0;
    const matchedOn = new Set<string>();

    const songArtists = splitArtists(song.artist);
    const matchedArtists = songArtists.filter((a) => requestedArtists.has(normalize(a)));
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

  const picks: { id: string; reason: string; song: Song }[] = [];

  if (requestedArtists.size > 0) {
    // Pedido explícito de artista(s) puntuales: la playlist tiene que ser SOLO de esos
    // artistas (nada de relleno con otros), repartiendo canciones entre todos los
    // pedidos por igual (round-robin) en vez de llenarse con el primero que aparezca
    // mejor rankeado. Si entre todos no llegan a `count`, devolvemos las que haya.
    const buckets = new Map<string, typeof ranked>();
    for (const entry of ranked) {
      const matchedArtistKey = splitArtists(entry.song.artist)
        .map((a) => normalize(a))
        .find((na) => requestedArtists.has(na));
      if (!matchedArtistKey) continue;
      if (!buckets.has(matchedArtistKey)) buckets.set(matchedArtistKey, []);
      buckets.get(matchedArtistKey)!.push(entry);
    }

    const shuffledBuckets = Array.from(buckets.values()).map((list) => shuffle(list));
    const seenIds = new Set<string>();
    let addedInLastRound = true;
    while (picks.length < count && addedInLastRound) {
      addedInLastRound = false;
      for (const bucket of shuffledBuckets) {
        if (picks.length >= count) break;
        while (bucket.length > 0) {
          const entry = bucket.shift()!;
          if (seenIds.has(entry.song.id)) continue;
          seenIds.add(entry.song.id);
          picks.push({ id: entry.song.id, reason: buildReason(entry.matchedOn, entry.song.genre), song: entry.song });
          addedInLastRound = true;
          break;
        }
      }
    }
  } else {
    // Mezclamos entre los mejores matches para que generar de nuevo con el mismo
    // mood no siempre tire la misma playlist, sin perder relevancia.
    const POOL_SIZE = Math.max(24, count * 3);
    // Barajamos para variedad, pero re-ordenamos por score (sort es estable) para que
    // los matches fuertes no queden afuera del corte.
    const primaryPool = shuffle(ranked.slice(0, Math.min(POOL_SIZE, ranked.length))).sort(
      (a, b) => b.score - a.score
    );
    // Sin shuffle: si hay que rellenar, priorizamos los siguientes mejores matches en vez de azar puro.
    const backfillPool = ranked;

    const usedArtists = new Map<string, number>();
    for (const entry of primaryPool) {
      if (picks.length >= count) break;
      const artistCount = usedArtists.get(entry.song.artist) ?? 0;
      if (artistCount >= 2) continue;
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
  }

  const matchedGenres = Array.from(new Set(allSongs.map((s) => s.genre).filter(Boolean)))
    .filter((g) => containsWord(normalizedMood, normalize(g)))
    .sort((a, b) => normalize(b).split(/\s+/).length - normalize(a).split(/\s+/).length);

  const topLabels = [...Array.from(matchedTags).map(labelFor), ...matchedGenres].slice(0, 2);

  let playlistName: string;
  let intro: string;
  if (requestedArtists.size > 0) {
    const artistList = Array.from(requestedArtists.values()).join(" y ");
    playlistName = `Playlist de ${artistList}`;
    const foundFewer = picks.length < count ? ` Por ahora solo tenemos ${picks.length}.` : "";
    intro =
      topLabels.length > 0
        ? `Lo que encontramos de ${artistList}, con foco en ${topLabels.join(" y ")}.${foundFewer}`
        : `Lo que encontramos de ${artistList}.${foundFewer}`;
  } else if (topLabels.length > 0) {
    playlistName = `Mixtape de ${topLabels.join(" y ")}`;
    intro = `Armada a partir de tu mood, con foco en ${topLabels.join(" y ")}.`;
  } else {
    playlistName = "Tu Mood Mixtape";
    intro = `Una selección variada para "${mood}".`;
  }

  return NextResponse.json({ playlistName, intro, picks });
}
