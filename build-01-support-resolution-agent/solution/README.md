# Build 1 solution

The finished code for [Build 1](../README.md), as it stands at the end of Step 6. Try the build yourself first; this is here for when you're stuck or want to compare.

| File | What it is |
| --- | --- |
| `src/backend.ts` | The fake customer and order database |
| `src/tools.ts` | Tool descriptions, JSON schemas, and handlers with structured errors (Steps 1 and 3) |
| `src/raw-agent.ts` | Phase A: the hand-written agent loop (Step 2) |
| `src/sdk-agent.ts` | Phase B: the Agent SDK version with hooks, escalation rules, and case facts (Steps 4 to 6) |

## Run it

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."
npm run raw        # Phase A
npm run sdk        # Phase B
FLAKY=1 npm run raw    # make the first order lookup time out
```

## Not included

The Step 7 experiments, which are temporary changes you make and then undo, and the cost-logging line from Experiment 5.

## Tested

Type-checks under strict TypeScript, both agents load, and the tool handlers were run directly for each error category. It was not run against the live API.
