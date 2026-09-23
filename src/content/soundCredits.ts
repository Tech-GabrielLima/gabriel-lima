import type { Lang } from "../film/store";

// Who made the film's music and sounds (film/sound.ts, public/audio). All CC0 or
// CC BY: the CC BY ones need title, author, source and licence, which the text
// version lists in full; the end credits roll the names.

export interface SoundCredit {
  kind: "music" | "sound";
  use: Record<Lang, string>;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  url: string;
  source: string;
}

export const SOUND_CREDITS: SoundCredit[] = [
  {
    kind: "music",
    use: {
      pt: "Saguão",
      en: "Lobby",
    },
    title: "Jazzy Vibes #81 - Jazz Piano Medley",
    author: "Tri-Tachyon",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/Tri-Tachyon/sounds/541689",
    source: "Freesound",
  },
  {
    kind: "music",
    use: {
      pt: "A Cabine",
      en: "The Booth",
    },
    title: "Deep Cinematic Rumble Stereo",
    author: "PatrickLieberkind",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/PatrickLieberkind/sounds/207555",
    source: "Freesound",
  },
  {
    kind: "music",
    use: {
      pt: "O Estúdio",
      en: "The Studio",
    },
    title: "Dusty Lofi Melody Loop 75 BPM",
    author: "holizna",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://freesound.org/people/holizna/sounds/629153",
    source: "Freesound",
  },
  {
    kind: "music",
    use: {
      pt: "O Beco",
      en: "The Alley",
    },
    title: "Alexi Action - I Am a Robot (Dark Synthwave)",
    author: "Alexi Action",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    url: "https://commons.wikimedia.org/w/index.php?curid=153212302",
    source: "Wikimedia Commons",
  },
  {
    kind: "music",
    use: {
      pt: "A Travessia",
      en: "The Crossing",
    },
    title:
      "Gentle beautiful piano music that is ideal for emotional, sad, and other scenes.",
    author: "kjartan_abel",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/kjartan_abel/sounds/532774",
    source: "Freesound",
  },
  {
    kind: "music",
    use: {
      pt: "A Lua",
      en: "The Moon",
    },
    title: "Ambient Voyager",
    author: "Zeropage",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    url: "https://www.jamendo.com/track/20231",
    source: "Jamendo",
  },
  {
    kind: "music",
    use: {
      pt: "Créditos",
      en: "Credits",
    },
    title: "Dramatic Ambient",
    author: "SoundFlakes",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/SoundFlakes/sounds/435766",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "projetor",
      en: "projector",
    },
    title: "Eumig_MARK501_8mm_Film_Projector",
    author: "High-Tec",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/High-Tec/sounds/346091",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "chuva",
      en: "rain",
    },
    title: "Rain on Window Ledge, Drops and Spashes",
    author: "Erbsland-Music",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/Erbsland-Music/sounds/184629",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "cidade",
      en: "city",
    },
    title: "Night Ambience",
    author: "brunoboselli",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://freesound.org/people/brunoboselli/sounds/459675",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "neon",
      en: "neon",
    },
    title: "neon sign buzz hum stereo close lowcut to taste3",
    author: "kyles",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://freesound.org/people/kyles/sounds/453490",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "mar",
      en: "sea",
    },
    title: "calm seawaves",
    author: "Eelke",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/Eelke/sounds/462592",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "respiração",
      en: "breathing",
    },
    title: "Oxygenated Breathing Inside Space Helmet",
    author: "Bliss",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/Bliss/sounds/167212",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "trovão",
      en: "thunder",
    },
    title: "Binaural Thunder A - Short",
    author: "digifishmusic",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/digifishmusic/sounds/34777",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "telefone",
      en: "telephone",
    },
    title: "old telephone bell (british version)",
    author: "FreqMan",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/FreqMan/sounds/25480",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "portas de enrolar",
      en: "roller shutters",
    },
    title: "open close window roller shutters wooden sound effect",
    author: "Garuda1982",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/Garuda1982/sounds/552385",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "interruptor",
      en: "switch",
    },
    title: "light switch",
    author: "kwahmah_02",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    url: "https://freesound.org/people/kwahmah_02/sounds/244923",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "rádio",
      en: "radio",
    },
    title: "FM radio tuning",
    author: "MrAuralization",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/MrAuralization/sounds/269701",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "sino",
      en: "bell",
    },
    title: "Bell ringing once",
    author: "Fenodyrie",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://freesound.org/people/Fenodyrie/sounds/583949",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "faísca",
      en: "spark",
    },
    title: "Taser",
    author: "JavierZumer",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/JavierZumer/sounds/257236",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "pato",
      en: "duck",
    },
    title: "Duck Quack - Sound Effect (HD)",
    author: "Tabby+Gus.",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://freesound.org/people/Tabby+Gus./sounds/515408",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "cortina",
      en: "curtain",
    },
    title: "whoosh_sound_01",
    author: "Artninja",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/Artninja/sounds/700222",
    source: "Freesound",
  },
  {
    kind: "sound",
    use: {
      pt: "porta",
      en: "door",
    },
    title: "Heavy Door Open 1",
    author: "Erbsland-Music",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    url: "https://freesound.org/people/Erbsland-Music/sounds/186739",
    source: "Freesound",
  },
];

/** The names for the end credits, each once, in order of appearance. */
export const creditNames = (kind: SoundCredit["kind"]) => [
  ...new Set(SOUND_CREDITS.filter((c) => c.kind === kind).map((c) => c.author)),
];
