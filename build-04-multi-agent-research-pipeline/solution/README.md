# Build 4 solution

The finished code for [Build 4](../README.md), as it stands at the end of Step 7. Try the build yourself first; this is here for when you're stuck or want to compare.

| File | What it is | Step |
| --- | --- | --- |
| `src/corpus.ts` | Ten fictional sources, the search logic, and the outage switch | Setup |
| `src/tools.ts` | The three research tools | 1 |
| `src/agents.ts` | All three subagent definitions | 2 and 3 |
| `src/probe.ts` | The one-subagent isolation experiment | 2 |
| `src/run.ts` | The coordinator, its hooks, and resume, fork, and recover handling | 4 to 7 |

## Run it

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."

npm run probe                                   # Step 2: does a subagent inherit context?
rm -rf state && npm run research                # default topic
FLAKY=once npm run research                     # a transient timeout
FLAKY=music npm run research                    # an outage on one sector
npm run research -- --resume <session-id> "follow-up question"
npm run research -- --fork <session-id> "alternative take"
npm run research -- --recover                   # rebuild from state/manifest.json
```

Each full run starts several subagents and costs more than the earlier builds. The script prints the cost at the end.

## Not included

The Step 8 experiments, which are temporary changes you make and then undo.

## Tested

Type-checks under strict TypeScript, and the corpus search, outage switch, and subagent tool scoping were checked directly. Nothing was run against the live API, so the agents' actual behavior is unverified.
