# Build 3 solution

The finished code for [Build 3](../README.md). Try the build yourself first; this is here for when you're stuck or want to compare.

| File | What it is | Step |
| --- | --- | --- |
| `make_samples.py` | Writes the ten test invoices and `labels.json` | Setup |
| `probe.py` | Finds which of your models accept a forced tool call | Setup |
| `schema.py` | The Pydantic model, its semantic checks, and both tool definitions | 1 |
| `extract.py` | Builds one request, with the rules and few-shot examples from Step 3 | 1 and 3 |
| `choices.py` | The `tool_choice` experiments | 2 |
| `pipeline.py` | Validation and retry | 4 |
| `batch.py` | Batch processing with resubmission of failures | 5 |
| `review.py` | Accuracy, calibration, and review routing | 6 |

## Run it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."

python make_samples.py
python probe.py                    # pick a model marked ACCEPTS
export MODEL="claude-haiku-4-5"    # or whichever your probe shows

python extract.py inv-001
python pipeline.py && python review.py
```

The model matters here. Current flagship models reject a forced tool call, and this build depends on one. Run `probe.py` before anything else.

## Not included

The Step 7 experiments, which are temporary changes you make and then undo.

## Tested

All files compile. `make_samples.py` and `schema.py` were run as written. `pipeline.py`, the result handling in `batch.py`, and `review.py` were run end to end against a stand-in for the API that returned canned responses, including failure cases. Nothing was run against the live API.
