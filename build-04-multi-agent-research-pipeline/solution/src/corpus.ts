// src/corpus.ts: a small FICTIONAL source library. Every organization and number is invented.

export type Sector = "visual" | "music" | "writing" | "film" | "cross";

export type Source = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published: string; // YYYY-MM-DD
  sector: Sector;
  text: string;
};

export const SOURCES: Source[] = [
  {
    id: "S1", sector: "visual", published: "2026-03-12",
    title: "Illustrator Income Survey 2026", publisher: "Northlight Institute",
    url: "https://northlight.example/illustrator-survey-2026",
    text: "In a survey of 2,400 freelance illustrators, 41% reported lower commission income than the year before, and most of them named AI image tools as the main cause. 58% said they now use AI tools themselves for early ideation. The survey was open to any working illustrator and was promoted through social media.",
  },
  {
    id: "S2", sector: "visual", published: "2024-05-20",
    title: "Illustrator Income Survey 2024", publisher: "Northlight Institute",
    url: "https://northlight.example/illustrator-survey-2024",
    text: "In the 2024 edition of this survey, 23% of freelance illustrators reported lower commission income than the year before. 31% said they had tried AI tools for ideation. Method and sample size match the later editions.",
  },
  {
    id: "S3", sector: "visual", published: "2026-04-02",
    title: "Member Poll: Commissions and AI", publisher: "Guild of Working Artists",
    url: "https://workingartists.example/poll-2026",
    text: "A poll of 600 dues-paying guild members found that 19% reported lower commission income over the past year. Respondents were established professionals with an average of eleven years in the field. The guild notes that newer artists, who are not well represented among members, may be affected differently.",
  },
  {
    id: "S4", sector: "music", published: "2026-02-18",
    title: "Session Work After Generative Audio", publisher: "Harbor Audio Research",
    url: "https://harboraudio.example/session-work-2026",
    text: "34% of session musicians surveyed said they had lost jingle or library-music work to generated audio in the past year. AI-generated tracks made up 18% of new uploads to the streaming services sampled in January 2026. Live performance income was unchanged.",
  },
  {
    id: "S5", sector: "music", published: "2025-11-05",
    title: "Royalty Pools and Synthetic Uploads", publisher: "Indie Label Collective",
    url: "https://indielabels.example/royalty-brief",
    text: "AI-generated tracks made up 12% of new uploads to major streaming services in October 2025. Because royalties are paid from a shared pool, the collective estimates that independent artists' per-stream payouts fell by about 4% over the year.",
  },
  {
    id: "S6", sector: "writing", published: "2026-01-27",
    title: "Copywriters and Client Loss", publisher: "Pressroom Workers Union",
    url: "https://pressroomunion.example/copy-survey",
    text: "27% of freelance copywriters said they lost at least one regular client to AI-written copy in 2025. Rates for product descriptions and short marketing copy fell the most. Book authors reported that advances were flat and that contracts now commonly include AI-training clauses.",
  },
  {
    id: "S7", sector: "writing", published: "2026-05-09",
    title: "Editorial Workflow Report", publisher: "Quillmark Publishing",
    url: "https://quillmark.example/workflow-2026",
    text: "63% of editors at the surveyed houses use AI for a first-pass copyedit. Average manuscript turnaround fell by 30%. Editors said the time saved moved to structural editing, and none of the houses reported cutting editorial staff.",
  },
  {
    id: "S8", sector: "film", published: "2026-06-15",
    title: "Previsualization Jobs Study", publisher: "Cutting Room Guild",
    url: "https://cuttingroom.example/previz-study",
    text: "Storyboard and previsualization postings fell 22% between 2024 and 2026. Rotoscoping work in visual effects is now largely automated at the studios surveyed. Demand for on-set crew and editors was stable.",
  },
  {
    id: "S9", sector: "film", published: "2025-09-30",
    title: "Localization Production Note", publisher: "Lumen Studios",
    url: "https://lumenstudios.example/localization-note",
    text: "AI dubbing reduced localization cost per title by 40% and let the studio release in nine more languages. Voice actors were paid a licensing fee for their voice models under a new agreement.",
  },
  {
    id: "S10", sector: "cross", published: "2026-07-01",
    title: "Creative Economy Monitor, Mid-2026", publisher: "Bureau of Creative Statistics",
    url: "https://creativestats.example/monitor-2026h1",
    text: "Total employment across creative industries rose 1.5% year over year. Gains in games, live events, and creative technology roles offset declines in illustration, copywriting, and previsualization.",
  },
];

export class TimeoutError extends Error {}

// FLAKY=once  -> the first search times out, then searches work (a transient blip).
// FLAKY=music -> every search touching music times out (an outage that will not clear).
let blipPending = process.env.FLAKY === "once";

export function search(query: string, sector?: Sector): Source[] {
  const q = query.toLowerCase();
  if (blipPending) {
    blipPending = false;
    throw new TimeoutError("source index timed out");
  }
  if (process.env.FLAKY === "music" && (sector === "music" || /music|audio|song|royalt/.test(q))) {
    throw new TimeoutError("source index timed out");
  }
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  return SOURCES
    .filter((s) => !sector || s.sector === sector)
    .map((s) => {
      const haystack = `${s.title} ${s.publisher} ${s.sector} ${s.text}`.toLowerCase();
      return { source: s, score: words.filter((w) => haystack.includes(w)).length };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((hit) => hit.source);
}

export function getSource(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id.toUpperCase());
}

// Finds a source that contains every number in the claim plus at least two of its longer words.
export function findSupport(claim: string): Source | undefined {
  const numbers = claim.match(/\d+(\.\d+)?/g) ?? [];
  const words = claim.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  return SOURCES.find((s) => {
    const text = s.text.toLowerCase();
    return numbers.every((n) => text.includes(n)) && words.filter((w) => text.includes(w)).length >= 2;
  });
}
