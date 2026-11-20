"""Step 6: measure accuracy, check calibration, and route records to a human."""
import json
import random
from collections import defaultdict
from pathlib import Path

FIELDS = ["vendor_name", "invoice_number", "po_number", "invoice_date", "stated_total"]
THRESHOLD = 0.9

labels = json.loads(Path("labels.json").read_text())
everything = json.loads(Path("results.json").read_text())
results = {r["id"]: r for r in everything if r["status"] == "ok"}


def same(extracted, truth) -> bool:
    if extracted is None or truth is None:
        return extracted is None and truth is None
    if isinstance(truth, (int, float)):
        return abs(float(extracted) - truth) < 0.01
    return str(extracted).strip().casefold() == str(truth).strip().casefold()


# One row per (document, field): was it right, and how confident was the model?
rows = []
for doc_id, record in results.items():
    for field in FIELDS:
        rows.append({
            "id": doc_id,
            "doc_type": labels[doc_id]["doc_type"],
            "field": field,
            "correct": same(record["data"][field], labels[doc_id][field]),
            "confidence": record["data"]["confidence"][field],
        })


def rate(group) -> str:
    return f"{sum(r['correct'] for r in group)}/{len(group)}"


print(f"Overall accuracy: {rate(rows)}\n")

print("Accuracy by document type and field")
by_cell = defaultdict(list)
for row in rows:
    by_cell[(row["doc_type"], row["field"])].append(row)
doc_types = sorted({r["doc_type"] for r in rows})
print(f"{'':10}" + "".join(f"{f:>16}" for f in FIELDS))
for doc_type in doc_types:
    print(f"{doc_type:10}" + "".join(f"{rate(by_cell[(doc_type, f)]):>16}" for f in FIELDS))

print("\nCalibration: does stated confidence match actual accuracy?")
for low, high in [(0.0, 0.7), (0.7, 0.9), (0.9, 1.01)]:
    bucket = [r for r in rows if low <= r["confidence"] < high]
    print(f"  confidence {low:.1f}-{min(high, 1.0):.1f}: {rate(bucket) if bucket else 'no fields'}")

print(f"\nRouting at threshold {THRESHOLD}")
to_review = {r["id"]: [f"extraction {r['status']}"] for r in everything if r["status"] != "ok"}
auto_approved = []
for doc_id, record in results.items():
    reasons = list(record["review_reasons"])
    reasons += [f"low confidence: {r['field']}" for r in rows if r["id"] == doc_id and r["confidence"] < THRESHOLD]
    if reasons:
        to_review[doc_id] = reasons
    else:
        auto_approved.append(doc_id)
for doc_id, reasons in to_review.items():
    print(f"  REVIEW {doc_id}: {'; '.join(reasons)}")
print(f"  AUTO   {auto_approved}")

wrong_but_auto = sorted({r["id"] for r in rows if r["id"] in auto_approved and not r["correct"]})
print(f"\nAuto-approved records containing an error: {wrong_but_auto or 'none'}")

print("\nStratified spot-check of auto-approved records (one per document type)")
random.seed(7)
for doc_type in doc_types:
    pool = [d for d in auto_approved if labels[d]["doc_type"] == doc_type]
    print(f"  {doc_type:8} -> {random.choice(pool) if pool else 'none auto-approved'}")
