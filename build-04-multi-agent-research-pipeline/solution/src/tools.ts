// src/tools.ts: the three research tools, served from an in-process MCP server.
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { search, getSource, findSupport, TimeoutError } from "./corpus.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

const fail = (errorCategory: string, isRetryable: boolean, message: string, extra: object = {}) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ errorCategory, isRetryable, message, ...extra }) }],
  isError: true,
});

export const researchServer = createSdkMcpServer({
  name: "research",
  version: "1.0.0",
  alwaysLoad: true,
  tools: [
    tool(
      "search_sources",
      `Search the source library by keyword. Returns up to 4 matches, each with source_id, title, publisher, url, published date, and a short excerpt.
Use this to DISCOVER which sources exist on a subtopic. It does not return full text: use load_document for that.
result_count 0 means the search ran and nothing matched. That is a valid answer, not a failure.
A timeout is returned as an error with isRetryable true.`,
      {
        query: z.string().describe("Keywords, e.g. 'illustrator commission income'"),
        sector: z.enum(["visual", "music", "writing", "film", "cross"]).optional()
          .describe("Restrict to one sector. Omit to search all."),
      },
      async ({ query, sector }) => {
        try {
          const hits = search(query, sector);
          return ok({
            result_count: hits.length,
            results: hits.map((s) => ({
              source_id: s.id, title: s.title, publisher: s.publisher, url: s.url,
              published: s.published, excerpt: s.text.slice(0, 140) + "...",
            })),
          });
        } catch (err) {
          if (err instanceof TimeoutError) {
            return fail("transient", true, "The source index timed out. No results were returned.", {
              attempted_query: query, attempted_sector: sector ?? null,
            });
          }
          throw err;
        }
      },
      { annotations: { readOnlyHint: true } }
    ),
    tool(
      "load_document",
      `Load the full text and metadata of one source by its source_id (for example S4), as returned by search_sources.
Use this to READ a source you already know about. It cannot search.`,
      { source_id: z.string().describe("e.g. S4") },
      async ({ source_id }) => {
        const source = getSource(source_id);
        if (!source) {
          return fail("validation", false, `No source with id "${source_id}". Use an id returned by search_sources.`);
        }
        return ok(source);
      },
      { annotations: { readOnlyHint: true } }
    ),
    tool(
      "verify_fact",
      `Check one specific claim that includes a number, name, or date against the source library.
Returns supported true with the matching source, or supported false.
For quick confirmation of a single fact only. It cannot explore a topic or find new sources.`,
      { claim: z.string().describe("One sentence, e.g. '41% of illustrators reported lower commission income'") },
      async ({ claim }) => {
        const source = findSupport(claim);
        return ok(source
          ? { supported: true, source_id: source.id, title: source.title, url: source.url, published: source.published }
          : { supported: false });
      },
      { annotations: { readOnlyHint: true } }
    ),
  ],
});
