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
    if (normalized.includes(phrase)) {
      tags.forEach((t) => matchedTags.add(t));
    }
  }
  // También permite que el usuario escriba el tag directamente en inglés.
  for (const tag of Object.keys(TAG_LABELS_ES)) {
    if (normalized.includes(tag)) matchedTags.add(tag);
  }

  let desiredEnergy: number | null = null;
  const highEnergyHit = ["energia", "gimnasio", "entrenar", "fiesta", "previa", "boliche"].some((w) =>
    normalized.includes(w)
  );
  const lowEnergyHit = ["triste", "llorar", "relax", "tranquilo", "tranquila", "lluvia", "domingo"].some(
    (w) => normalized.includes(w)
  );
  if (highEnergyHit && !lowEnergyHit) desiredEnergy = 9;
  else if (lowEnergyHit && !highEnergyHit) desiredEnergy = 3;

  return { tokenSet, matchedTags, desiredEnergy };
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function POST(req: NextRequest) {
  let mood: string;
  try {
    const body = await req.json();
    mood = String(body?.mood ?? "").trim();
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
  const { tokenSet, matchedTags, desiredEnergy } = extractSignals(mood);

  const scored = catalog.map((song) => {
    let score = 0;
    const matchedOn = new Set<string>();

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

    const normalizedGenre = normalize(song.genre);
    if (tokenSet.has(normalizedGenre) || normalize(mood).includes(normalizedGenre)) {
      score += 2;
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
  const POOL_SIZE = 24;
  const primaryPool = shuffle(ranked.slice(0, Math.min(POOL_SIZE, ranked.length)));
  const backfillPool = shuffle(ranked);

  const picks: { id: string; reason: string; song: Song }[] = [];
  const usedArtists = new Map<string, number>();
  for (const entry of primaryPool) {
    if (picks.length >= 8) break;
    const artistCount = usedArtists.get(entry.song.artist) ?? 0;
    if (artistCount >= 2) continue;
    usedArtists.set(entry.song.artist, artistCount + 1);

    const reasonTags = Array.from(entry.matchedOn).slice(0, 2).map(labelFor);
    const reason =
      reasonTags.length > 0
        ? `Coincide en ${reasonTags.join(" y ")}.`
        : `Buena opción de ${entry.song.genre} para variar.`;

    picks.push({ id: entry.song.id, reason, song: entry.song });
  }

  if (picks.length < 6) {
    for (const entry of backfillPool) {
      if (picks.length >= 6) break;
      if (picks.some((p) => p.id === entry.song.id)) continue;
      picks.push({
        id: entry.song.id,
        reason: `Buena opción de ${entry.song.genre} para variar.`,
        song: entry.song,
      });
    }
  }

  const topLabels = Array.from(matchedTags).slice(0, 2).map(labelFor);
  const playlistName =
    topLabels.length > 0 ? `Mixtape de ${topLabels.join(" y ")}` : "Tu Mood Mixtape";
  const intro =
    topLabels.length > 0
      ? `Armada a partir de tu mood, con foco en ${topLabels.join(" y ")}.`
      : `Una selección variada para "${mood}".`;

  return NextResponse.json({ playlistName, intro, picks });
}
