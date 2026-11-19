# Build 3: Structured Extraction Pipeline — Step-by-Step

[Back to the study guide](../README.md) · Last revised Nov 18, 2026

## What you're building

You're building a pipeline that reads messy invoices as plain text and produces clean, validated records, then decides which records a human should check. Plan on 3 to 4 hours.

Builds 1 and 2 were about agents that act. This one is about getting reliable data out of a model, which is a different skill. The model isn't deciding what to do next. It's filling in a form, and your job is to design the form, check the answers, and know which answers to distrust.

This build is in Python. The exam guide names Pydantic for schema validation, so it's worth meeting the term in its native habitat. It uses the plain Claude API, with no Agent SDK.

### Three ideas to hold before you start

1. **A schema guarantees shape, not truth.** Forcing the model to answer through a tool with a JSON schema means the output always parses and always has the right fields. It says nothing about whether the values are correct. An invoice total of 4,100 in the `stated_total` field is valid JSON whether or not the invoice says 4,100.
2. **A required field is a demand for an answer.** If the document doesn't contain a PO number and the schema insists on one, the model will produce something. Nullable fields are how you let it say "not here."
3. **Retrying fixes mistakes, not absences.** If the model put a date in the wrong format, telling it so and asking again works. If the information isn't in the document, asking again a hundred times won't put it there.

Think of the schema as a firewall rule on the output port: it controls what shape of packet gets through, not whether the payload is true. Validation is the application-layer check behind it.

### What each step maps to on the exam

| Step | You build | Exam task statements |
| --- | --- | --- |
| 1 | A schema and a forced tool call | 4.3 |
| 2 | `tool_choice` in all three modes | 2.3, 4.3 |
| 3 | Few-shot examples and normalization rules | 4.2 |
| 4 | Validation with retry, and its limits | 4.4 |
| 5 | Batch processing with failure handling | 4.5 |
| 6 | Confidence-based human review | 5.5 |
| 7 | Deliberate breakage | Sample question 11 and Scenario 6 |

## Setup

You need Python 3.10 or newer and the same API key you used in Build 1.

```bash
mkdir extraction && cd extraction
python3 -m venv .venv && source .venv/bin/activate
pip install anthropic pydantic
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Files you'll end up with.**

| File | Purpose | Created in |
| --- | --- | --- |
| `make_samples.py` | Writes ten test invoices and their correct answers | Setup |
| `schema.py` | The record shape and the rules a valid record obeys | Step 1 |
| `extract.py` | Builds one extraction request | Step 1 |
| `choices.py` | `tool_choice` experiments | Step 2 |
| `pipeline.py` | Validation and retry | Step 4 |
| `batch.py` | Batch processing | Step 5 |
| `review.py` | Accuracy, calibration, and routing | Step 6 |

### The sample documents

You need documents where you already know the right answers, or you can't measure anything. This script writes ten invoices to `samples/` and the correct values to `labels.json`. Each document is rigged with one specific difficulty.

Create `make_samples.py`:

```python
"""Writes samples/*.txt and labels.json. Run once: python make_samples.py"""
import json
from pathlib import Path

long_items = "\n".join(
    f"{n:>2}  Replacement part #{1000 + n:<22} 1   {12.50:>8.2f}" for n in range(1, 41)
)

DOCS = [
    {
        "id": "inv-001", "doc_type": "table",
        "truth": {"vendor_name": "Cascade Rope Co.", "invoice_number": "INV-2041",
                  "po_number": "PO-7731", "invoice_date": "2026-10-03", "stated_total": 1240.00},
        "text": """CASCADE ROPE CO.
Invoice INV-2041            Date: 2026-10-03
Bill to: Northwind Outfitters       PO: PO-7731

Qty  Description                 Amount
10   Dynamic rope 60m            1,100.00
 4   Rope bag                      140.00
                         TOTAL   1,240.00
Terms: Net 30""",
    },
    {
        "id": "inv-002", "doc_type": "table",
        "truth": {"vendor_name": "Granite Peak Supply", "invoice_number": "GP-0093",
                  "po_number": None, "invoice_date": "2026-10-14", "stated_total": 356.40},
        "text": """Granite Peak Supply -- INVOICE
No. GP-0093                 Oct 14, 2026
Customer: Northwind Outfitters

Item                          Qty    Line total
Chalk, 1kg                     12       118.80
Belay gloves                    6       237.60
Amount due: $356.40
Payment terms: NET 15""",
    },
    {
        "id": "inv-003", "doc_type": "email",
        "truth": {"vendor_name": "Ridgeline Guides LLC", "invoice_number": "88-A",
                  "po_number": None, "invoice_date": "2026-10-02", "stated_total": 1200.00},
        "text": """From: billing@ridgelineguides.example
Subject: bill for September guide training

Hi there,

Here's what you owe Ridgeline Guides LLC for the September staff training:
twelve hundred dollars even, for the two-day course. This is invoice no. 88-A,
dated the 2nd of October 2026. It's due when you get this.

Thanks,
Mara""",
    },
    {
        "id": "inv-004", "doc_type": "table",
        "truth": {"vendor_name": "Tall Pine Textiles", "invoice_number": "TP-5510",
                  "po_number": "PO-7802", "invoice_date": "2026-10-20", "stated_total": 1080.00},
        "text": """TALL PINE TEXTILES                    INVOICE TP-5510
Date 2026-10-20        Your PO: PO-7802

Fleece liner (40 units)        600.00
Wool socks (95 pairs)          380.00
                 TOTAL DUE   1,080.00
Net 30""",
    },
    {
        "id": "inv-005", "doc_type": "email",
        "truth": {"vendor_name": "Basecamp Print Shop", "invoice_number": "BPS-311",
                  "po_number": None, "invoice_date": "2026-10-22", "stated_total": 415.00},
        "text": """From: accounts@basecampprint.example
Subject: Invoice BPS-311

Hello,

Invoice BPS-311 from Basecamp Print Shop, 22 October 2026. As agreed, this is
billed against the purchase order you already have on file with us.

500 trail maps, folded ........ $340
Rush fee ....................... $75
Total .......................... $415

Net 30 as usual.""",
    },
    {
        "id": "inv-006", "doc_type": "table",
        "truth": {"vendor_name": "Alpen Werk GmbH", "invoice_number": "AW-2026-118",
                  "po_number": "PO-7790", "invoice_date": "2026-10-09", "stated_total": 2310.00},
        "text": """Alpen Werk GmbH
Rechnung / Invoice AW-2026-118       09.10.2026
Bestellnummer / PO: PO-7790

Pos  Artikel                   Betrag (EUR)
1    Ice axe, 60cm (x15)          1.650,00
2    Crampons, pair (x6)            660,00
     Summe / Total                2.310,00 EUR
Zahlungsbedingungen: 2/10 net 45""",
    },
    {
        "id": "inv-007", "doc_type": "receipt",
        "truth": {"vendor_name": "Summit Hardware", "invoice_number": None,
                  "po_number": None, "invoice_date": "2026-10-11", "stated_total": 42.17},
        "text": """SUMMIT HARDWARE
10/11/2026 14:02  Register 3

Paracord 100ft        18.99
Duct tape              7.49
Zip ties (100)        12.50
Tax                    3.19
TOTAL                 42.17
VISA ****4417  APPROVED""",
    },
    {
        "id": "inv-008", "doc_type": "table",
        "truth": {"vendor_name": "Ironwood Parts Depot", "invoice_number": "IW-77102",
                  "po_number": "PO-7815", "invoice_date": "2026-10-27", "stated_total": 500.00},
        "text": f"""IRONWOOD PARTS DEPOT
Invoice IW-77102     Date: 2026-10-27     PO: PO-7815

 #  Description                    Qty    Amount
{long_items}
                                  TOTAL    500.00
Terms: Net 60""",
    },
    {
        "id": "inv-009", "doc_type": "email",
        "truth": {"vendor_name": "Lena's Climbing Gear", "invoice_number": None,
                  "po_number": None, "invoice_date": "2026-10-30", "stated_total": 234.00},
        "text": """From: lena@lenasgear.example
Sent: 30 Oct 2026
Subject: carabiners

Hey! Lena's Climbing Gear here. Sent over a couple dozen carabiners at $9 each
like you asked. Shipping was 18 bucks. So 234 all in. No rush on payment.""",
    },
    {
        "id": "inv-010", "doc_type": "table",
        "truth": {"vendor_name": "Blue Heron Kayaks", "invoice_number": "BH-4402",
                  "po_number": "PO-7820", "invoice_date": "2026-11-02", "stated_total": 3150.00},
        "text": """INVOICE BH-4402                         2 November 2026
PO-7820

Touring kayak, 14ft     3    2,850.00
Paddle, carbon          3      300.00
Total                        3,150.00
Net 60

Remit to: Blue Heron Kayaks, 14 Dock Road""",
    },
]

NOTE = """Hi team,

Just wanted to say thanks for the great service on our order last month.
The tents arrived early and the crew loved them.

Best,
Priya"""

out = Path("samples")
out.mkdir(exist_ok=True)
for d in DOCS:
    (out / f"{d['id']}.txt").write_text(d["text"] + "\n")
(out / "note-011.txt").write_text(NOTE + "\n")
Path("labels.json").write_text(json.dumps(
    {d["id"]: {"doc_type": d["doc_type"], **d["truth"]} for d in DOCS}, indent=2))
print(f"Wrote {len(DOCS)} invoices, 1 non-invoice note, and labels.json")
```

Run it:

```bash
python make_samples.py
```

### What each document is testing

| Document | Type | The trap |
| --- | --- | --- |
| inv-001 | table | None. The clean baseline. |
| inv-002 | table | No PO number; date written "Oct 14, 2026" |
| inv-003 | email | Amount in words; "due when you get this" |
| inv-004 | table | Line items sum to 980 but the stated total is 1,080 |
| inv-005 | email | Refers to "the purchase order you already have on file" without printing it |
| inv-006 | table | Euros, European number format, terms not in your list |
| inv-007 | receipt | No invoice number; the date 10/11/2026 reads two ways |
| inv-008 | table | Forty line items, long enough to truncate |
| inv-009 | email | "A couple dozen"; no invoice number; no terms |
| inv-010 | table | Vendor name appears only in the footer |
| note-011 | n/a | Not an invoice at all |

Skim two or three of the files in `samples/` before you go on. You're about to ask a model to read them, and it helps to have read them yourself.

### Pick a model that accepts a forced tool call

Current flagship models, Sonnet 5.5 and Opus 5.5 among them, reject forced tool choice and accept only `auto` and `none`. A request that forces a tool on one of them fails with `tool_choice: type "tool" and "any" are not supported for this model.`

The exam guide was written when forcing a tool was available on every model, and it tests the three modes. So this build needs a model that still accepts them. Create `probe.py` to find out which of your models do:

```python
"""Which models on my account accept a forced tool call? Run: python probe.py"""
import anthropic

client = anthropic.Anthropic()
TOOL = {
    "name": "ping",
    "description": "Reply through this tool.",
    "input_schema": {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
}

for model in client.models.list(limit=50):
    try:
        client.messages.create(
            model=model.id,
            max_tokens=50,
            tools=[TOOL],
            tool_choice={"type": "tool", "name": "ping"},
            messages=[{"role": "user", "content": "ping"}],
        )
        print(f"ACCEPTS  {model.id}")
    except anthropic.APIStatusError as error:
        print(f"REJECTS  {model.id}  ({error.status_code}: {str(error.message)[:60]})")
```

```bash
python probe.py
```

Pick the cheapest model marked `ACCEPTS` and use it for the whole build:

```bash
export MODEL="claude-haiku-4-5"     # or whichever your probe shows
```

`claude-haiku-4-5` is the default in the code below because other developers' tests show it accepting forced calls. Your probe output is the authority, not this default.

The line `ANTHROPIC_API_KEY is set and takes precedence...` that the SDK prints is informational and can be ignored.

## Step 1: A schema and a forced tool call

The reliable way to get structured data from Claude is to define a tool whose input schema is the record you want, then require the model to call it. You never run the tool. The "call" is the output.

### 1a. The schema

Pydantic lets you describe a record as a Python class. It then does two jobs from that one definition: it generates the JSON Schema you send to the API, and it validates what comes back.

Create `schema.py`:

```python
"""The shape of one extracted invoice, and the rules a valid one must satisfy."""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class LineItem(BaseModel):
    description: str
    quantity: Optional[float] = Field(description="Null if the document gives no quantity.")
    amount: float = Field(description="Line total as a plain number, no symbols.")


class Confidence(BaseModel):
    """How sure the model is about each key field, from 0 to 1."""
    vendor_name: float = Field(ge=0, le=1)
    invoice_number: float = Field(ge=0, le=1)
    po_number: float = Field(ge=0, le=1)
    invoice_date: float = Field(ge=0, le=1)
    stated_total: float = Field(ge=0, le=1)


class Invoice(BaseModel):
    vendor_name: str
    invoice_number: Optional[str] = Field(description="Null if the document has none. Never invent one.")
    po_number: Optional[str] = Field(
        description="Purchase order number printed in THIS document. Null if absent or only referred to."
    )
    invoice_date: Optional[date] = Field(description="ISO 8601: YYYY-MM-DD.")
    currency: Literal["USD", "EUR", "GBP", "other"]
    currency_detail: Optional[str] = Field(description="The currency, when currency is 'other'. Otherwise null.")
    payment_terms: Literal["net_15", "net_30", "net_60", "due_on_receipt", "other", "unclear"]
    payment_terms_detail: Optional[str] = Field(
        description="The terms as written, when payment_terms is 'other'. Otherwise null."
    )
    line_items: list[LineItem]
    stated_total: Optional[float] = Field(description="The total printed on the document. Null if none is printed.")
    calculated_total: float = Field(description="Your own sum of the line item amounts.")
    conflict_detected: bool = Field(description="True when stated_total and calculated_total differ.")
    confidence: Confidence

    @model_validator(mode="after")
    def check_semantics(self):
        errors = []
        items_sum = round(sum(item.amount for item in self.line_items), 2)
        if abs(items_sum - self.calculated_total) > 0.01:
            errors.append(
                f"calculated_total is {self.calculated_total} but the line item amounts sum to {items_sum}. Recompute it."
            )
        if self.stated_total is not None:
            differ = abs(self.stated_total - self.calculated_total) > 0.01
            if differ and not self.conflict_detected:
                errors.append(
                    f"stated_total {self.stated_total} differs from calculated_total {self.calculated_total}, "
                    "so conflict_detected must be true. Do not change either number to make them agree."
                )
            if not differ and self.conflict_detected:
                errors.append("conflict_detected is true but the two totals agree. Set it to false.")
        if self.currency == "other" and not self.currency_detail:
            errors.append("currency is 'other', so currency_detail must name the currency.")
        if self.payment_terms == "other" and not self.payment_terms_detail:
            errors.append("payment_terms is 'other', so payment_terms_detail must give the terms as written.")
        if errors:
            raise ValueError(" | ".join(errors))
        return self


EXTRACT_TOOL = {
    "name": "record_invoice",
    "description": (
        "Record the fields extracted from one invoice or receipt. "
        "Call this exactly once per document. Use null for anything the document does not contain."
    ),
    "input_schema": Invoice.model_json_schema(),
}

REJECT_TOOL = {
    "name": "flag_not_an_invoice",
    "description": (
        "Use instead of record_invoice when the document is not an invoice or receipt at all, "
        "for example a thank-you note or a shipping notice with no amounts owed."
    ),
    "input_schema": {
        "type": "object",
        "properties": {"reason": {"type": "string", "description": "One sentence on what the document is."}},
        "required": ["reason"],
    },
}
```

Look at what Pydantic generated before you use it:

```bash
python -c "import json, schema; print(json.dumps(schema.EXTRACT_TOOL['input_schema']['properties']['po_number'], indent=2))"
```

You'll see `anyOf` with a string type and a null type. That's "required, but null is an acceptable answer."

The `check_semantics` method is used in Step 4, and `REJECT_TOOL` in Step 2. Ignore both for now.

### 1b. The request

Create `extract.py`:

```python
"""Builds one extraction request. Shared by the live pipeline and the batch job."""
import os
from pathlib import Path

import anthropic

from schema import EXTRACT_TOOL

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
MODEL = os.environ.get("MODEL", "claude-haiku-4-5")  # must accept forced tool_choice; see Setup

SYSTEM_V1 = "Extract the invoice fields from the document by calling record_invoice."

SYSTEM = SYSTEM_V1
FORCED = {"type": "tool", "name": "record_invoice"}


def build_request(doc_text: str, tool_choice: dict = FORCED, max_tokens: int = 4000) -> dict:
    return {
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": SYSTEM,
        "tools": [EXTRACT_TOOL],
        "tool_choice": tool_choice,
        "messages": [{"role": "user", "content": f"<document>\n{doc_text}\n</document>"}],
    }


def find_tool_use(message):
    """Return the first tool_use block in a response, or None."""
    return next((block for block in message.content if block.type == "tool_use"), None)


def load_docs(pattern: str = "inv-*.txt") -> dict[str, str]:
    return {path.stem: path.read_text() for path in sorted(Path("samples").glob(pattern))}


if __name__ == "__main__":
    import json
    import sys

    doc_id = sys.argv[1] if len(sys.argv) > 1 else "inv-001"
    message = client.messages.create(**build_request(load_docs()[doc_id]))
    print("stop_reason:", message.stop_reason)
    print(json.dumps(find_tool_use(message).input, indent=2))
```

Run it on the clean invoice, then on two awkward ones:

```bash
python extract.py inv-001
python extract.py inv-005
python extract.py inv-006
```

For inv-005, check `po_number`. The email mentions a purchase order without printing its number, so the right answer is `null`. For inv-006, check `payment_terms`: "2/10 net 45" isn't in your list, so it should come back as `other` with the original text in `payment_terms_detail`.

### What to notice, and why

- **The tool call is the output.** `stop_reason` is `tool_use`, the same signal as Build 1, but here you don't loop. You read `block.input` and you're done. The input arrives already parsed into a Python dict, so there's no JSON string to parse and no syntax error to catch.
- **Forcing the tool guarantees a call.** `tool_choice` with a named tool means the model can't reply in prose instead. Step 2 explores the alternatives.
- **Nullable fields prevent fabrication.** Every `Optional[...]` field tells the model that "not present" is a legitimate answer. Make `po_number` a plain `str` and the model must put something there for inv-005. Step 7 has you try it.
- **`other` plus a detail field keeps the enum open.** A closed list of payment terms will meet a term it doesn't contain. Without `other`, the model picks the nearest wrong value. With it, you keep the original text and can extend the list later.
- **`unclear` is different from `other`.** `other` means the document states something outside your list. `unclear` means the document doesn't say. Collapsing them loses information you'll want in review.
- **`stated_total` and `calculated_total` are separate on purpose.** Extracting both lets code compare them. If you ask for one "total," the model silently reconciles any disagreement and you never learn there was one.
- **Field descriptions are prompts.** The text in each `Field(description=...)` ends up in the schema and the model reads it. "Null if absent or only referred to" does real work.

## Step 2: The three `tool_choice` modes

`tool_choice` controls whether the model must call a tool and which one. There are three settings, and the exam expects you to know what each guarantees.

| Setting | What the model may do |
| --- | --- |
| `{"type": "auto"}` | Call a tool, or answer in text. Its choice. |
| `{"type": "any"}` | Must call a tool. It picks which. |
| `{"type": "tool", "name": "..."}` | Must call that specific tool. |

Create `choices.py`. It sends two documents, a real invoice and a thank-you note, through each mode:

```python
"""Step 2: the same documents under each tool_choice mode."""
import sys

from extract import build_request, client, load_docs
from schema import EXTRACT_TOOL, REJECT_TOOL

MODES = {
    "auto": {"type": "auto"},
    "any": {"type": "any"},
    "forced": {"type": "tool", "name": "record_invoice"},
}

docs = {**load_docs("inv-001.txt"), **load_docs("note-*.txt")}
two_tools = len(sys.argv) > 1 and sys.argv[1] == "two-tools"

for doc_id, text in docs.items():
    for mode, choice in MODES.items():
        request = build_request(text, tool_choice=choice)
        if two_tools:
            request["tools"] = [EXTRACT_TOOL, REJECT_TOOL]
        message = client.messages.create(**request)
        blocks = [b.name if b.type == "tool_use" else b.type for b in message.content]
        print(f"{doc_id:9} {mode:7} stop_reason={message.stop_reason:9} blocks={blocks}")
```

### 2a. One tool

```bash
python choices.py
```

Read the six lines. For the invoice, all three modes probably call `record_invoice`. The thank-you note is where they separate:

- Under `auto`, the model may reply in plain text that this isn't an invoice. `stop_reason` is `end_turn` and there is no tool call for your code to read.
- Under `any` and `forced`, it must call `record_invoice`, so you get an invoice record for a document that isn't one. Print one with `python -c "from extract import *; print(find_tool_use(client.messages.create(**build_request(load_docs('note-*.txt')['note-011']))).input)"` and look at what it had to make up.

### 2b. Two tools

```bash
python choices.py two-tools
```

Now the model also has `flag_not_an_invoice`. Under `any`, it must call something, and it can choose the honest option for the note. Under `forced`, it's still pinned to `record_invoice`.

### What to notice, and why

- **`auto` gives no guarantee of structure.** If your code does `find_tool_use(message).input` and the model answered in text, that's a crash. In a pipeline, `auto` is the wrong default.
- **`any` is for "must be structured, type unknown."** When several schemas exist and you don't know which document you have, `any` guarantees a tool call while leaving the choice to the model. This is the case the exam describes for `any`.
- **Forced selection is for ordering.** Use it when one specific extraction must happen first, such as pulling metadata before any enrichment step. Later steps go in follow-up requests.
- **Forcing a tool also forces an answer.** A model with one tool and no exit will fill the form with whatever it can. Give it a legitimate way to decline, either a second tool as here or a `document_type` field with a "not applicable" value.
- **None of this checks correctness.** All three modes can return a schema-valid record with wrong values. Structure and accuracy are separate problems, and Steps 3 through 6 are about the second one.

## Step 3: Few-shot examples and normalization rules

The schema says what shape the answer takes. It doesn't say how to turn "twelve hundred dollars even" into `1200` or what to do with "the PO you have on file." Those are judgment calls, and the most effective way to teach judgment is to show worked examples.

### 3a. See the baseline first

Run the three informal documents with the one-line prompt you have now:

```bash
python extract.py inv-003
python extract.py inv-007
python extract.py inv-009
```

Compare each against the trap table in Setup. Look at how dates are formatted, whether "a couple dozen" became a quantity of 24, what `payment_terms` says when no terms are stated, and what the `confidence` numbers look like. Note anything that's off. Results vary from run to run, which is part of the point.

### 3b. Add rules and two examples

In `extract.py`, replace the line `SYSTEM = SYSTEM_V1` with:

```python
SYSTEM_V2 = SYSTEM_V1 + """

Rules:
- Dates: output YYYY-MM-DD. Convert any other format.
- Amounts: plain numbers. Strip currency symbols and thousands separators. Convert words ("twelve hundred") to digits.
- Never invent a value. If the document does not contain a field, use null.
- po_number: only a PO number printed in this document. A mention like "the PO on file" is null.
- line_items: one entry per billed line, including tax, shipping, and fees.
- calculated_total is your own sum of the line items. stated_total is the total printed on the document. If they differ, set conflict_detected to true and leave both numbers as they are.
- payment_terms: "unclear" when the document does not state terms. "other" plus payment_terms_detail when it states terms that are not in the list.
- confidence: 1.0 only for a value printed verbatim. Lower it when you converted, inferred, or chose between readings. For a null field, give your confidence that the value is truly absent.

Examples:

Document: "Hey, it's Otto's Outfitting. Two dozen headlamps at $20 apiece plus fifteen for shipping, so 495 total. Sent 5 Sept 2026. Use the PO we set up last spring."
Extraction notes: vendor_name "Otto's Outfitting". invoice_number null (none given). po_number null (referred to, not printed). invoice_date "2026-09-05". line_items: headlamps quantity 24 amount 480; shipping quantity null amount 15. stated_total 495, calculated_total 495, conflict_detected false. payment_terms "unclear". confidence.po_number high, because the document clearly does not print one.

Document: a table listing "Tent stakes 200.00" and "Guy line 150.00" with "TOTAL 400.00" and "Terms: 1% 10 net 30".
Extraction notes: stated_total 400, calculated_total 350, conflict_detected true. Do not adjust a line item to make the totals agree. payment_terms "other", payment_terms_detail "1% 10 net 30"."""

SYSTEM = SYSTEM_V1 if os.environ.get("PROMPT") == "v1" else SYSTEM_V2
```

The last line keeps the old prompt available. `PROMPT=v1 python extract.py inv-003` runs the baseline; without the variable you get the new one.

### 3c. Compare

Rerun the three documents from 3a and compare with what you noted. Then check the two the examples were aimed at:

```bash
python extract.py inv-004     # totals disagree: conflict_detected should be true, both numbers intact
python extract.py inv-005     # PO referred to, not printed: po_number should be null
```

You'll put a number on the improvement in Step 6, once there's a scorer.

### What to notice, and why

- **The examples target the ambiguous cases.** Neither example is a clean invoice, because the model already handles those. Each one shows a judgment call: a PO that's mentioned but not printed, totals that disagree. Two to four examples aimed at the hard cases is the exam's recommended range.
- **The examples show reasoning, not just answers.** "Null (referred to, not printed)" tells the model why. That's what lets it generalize to a case you didn't show, such as inv-005's differently worded reference.
- **Neither example appears in your test set.** If you paste a test document in as an example, you're measuring memory. Examples and evaluation data stay separate.
- **Rules handle format; examples handle judgment.** "Dates are YYYY-MM-DD" is a rule, and a rule is enough. "What counts as a PO number being present" needed an example. The exam pairs normalization rules in the prompt with a strict output schema, which is what you now have.
- **Few-shot examples reduce fabrication.** Showing a correct `null` gives the model a precedent for leaving a field empty. That matters most on informal documents, where the pull to fill every field is strongest.
- **Vague instructions wouldn't have done this.** "Be careful with ambiguous fields" names no behavior. Each rule above names one.

## Step 4: Validation, retry, and the limits of retry

A record can pass the schema and still be wrong. Line items that don't add up to the total and a date in the wrong format are both things code can catch. When it does, you send the specific error back and ask the model to fix it. That works for mistakes. It does not work for information that was never in the document.

### 4a. Watch the validator work, with no API call

This feeds two hand-made bad records to the `Invoice` class from Step 1:

```bash
python - <<'EOF'
from pydantic import ValidationError
from schema import Invoice

record = {
    "vendor_name": "Tall Pine Textiles", "invoice_number": "TP-5510", "po_number": "PO-7802",
    "invoice_date": "10/20/2026", "currency": "USD", "currency_detail": None,
    "payment_terms": "net_30", "payment_terms_detail": None,
    "line_items": [{"description": "Fleece liner", "quantity": 40, "amount": 600},
                   {"description": "Wool socks", "quantity": 95, "amount": 380}],
    "stated_total": 1080, "calculated_total": 1080, "conflict_detected": False,
    "confidence": {"vendor_name": 1, "invoice_number": 1, "po_number": 1, "invoice_date": 1, "stated_total": 1},
}

for label, candidate in [("bad date", record), ("date fixed", {**record, "invoice_date": "2026-10-20"})]:
    try:
        Invoice.model_validate(candidate)
        print(label, "-> valid")
    except ValidationError as error:
        for item in error.errors():
            print(label, "->", item["loc"], item["msg"])
EOF
```

The first record fails on the date format. The second has a well-formed date and fails anyway: `calculated_total` says 1080, but the line items sum to 980. That second failure is a semantic error. The JSON is perfect and the content is wrong.

### 4b. The pipeline

Create `pipeline.py`:

```python
"""Step 4: extract, validate, and retry with specific error feedback."""
import json
from pathlib import Path

from pydantic import ValidationError

from extract import build_request, client, find_tool_use, load_docs
from schema import Invoice


def describe(error: ValidationError) -> str:
    """Turn Pydantic's error list into lines the model can act on."""
    lines = []
    for item in error.errors():
        where = ".".join(str(part) for part in item["loc"]) or "record"
        lines.append(f"- {where}: {item['msg']}")
    return "\n".join(lines)


def check(tool_input: dict) -> tuple[Invoice | None, str]:
    try:
        return Invoice.model_validate(tool_input), ""
    except ValidationError as error:
        return None, describe(error)


def finish(doc_id: str, invoice: Invoice, attempts: int) -> dict:
    """A valid record. Note anything a retry could never have fixed."""
    review_reasons = []
    if invoice.po_number is None:
        review_reasons.append("po_number absent from source")
    if invoice.conflict_detected:
        review_reasons.append("stated and calculated totals differ")
    return {
        "id": doc_id,
        "status": "ok",
        "attempts": attempts,
        "review_reasons": review_reasons,
        "data": invoice.model_dump(mode="json"),
    }


def extract_with_retry(doc_id: str, text: str, max_retries: int = 2) -> dict:
    request = build_request(text)
    errors = ""
    for attempt in range(1, max_retries + 2):
        message = client.messages.create(**request)
        block = find_tool_use(message)
        if message.stop_reason == "max_tokens" or block is None:
            return {"id": doc_id, "status": "truncated", "attempts": attempt}

        invoice, errors = check(block.input)
        if invoice:
            return finish(doc_id, invoice, attempt)

        print(f"  {doc_id} attempt {attempt} failed validation:\n{errors}")
        # The document is already in the conversation. Add the failed
        # extraction and the specific errors, then ask again.
        request["messages"] += [
            {"role": "assistant", "content": message.content},
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "is_error": True,
                        "content": (
                            f"Validation failed:\n{errors}\n"
                            "Call record_invoice again. Change only what these errors require."
                        ),
                    }
                ],
            },
        ]
    return {"id": doc_id, "status": "failed_validation", "attempts": max_retries + 1, "errors": errors}


if __name__ == "__main__":
    results = []
    for doc_id, text in load_docs().items():
        result = extract_with_retry(doc_id, text)
        print(f"{doc_id}: {result['status']} in {result['attempts']} attempt(s) {result.get('review_reasons', '')}")
        results.append(result)
    Path("results.json").write_text(json.dumps(results, indent=2))
    print("Wrote results.json")
```

Run it over all ten documents:

```bash
python pipeline.py
```

With the Step 3 prompt, most documents should pass on the first attempt, and you may see no retries at all. To watch the retry path fire, run the weaker prompt:

```bash
PROMPT=v1 python pipeline.py
```

Any `failed validation` lines show the exact error text the model was sent. A document that says `ok in 2 attempt(s)` was fixed by the feedback.

Finish with a plain `python pipeline.py` so `results.json` holds the good run.

### 4c. The cases retry can't fix

Look at the documents flagged `po_number absent from source`. Suppose your accounting system requires a PO number on every invoice. You could mark the field as required and non-null, let validation fail, and retry. It would fail three times and cost three requests, because the PO number isn't in the document. Or the model would give up and invent one, which is worse.

`finish` handles this the right way. A null PO number is a valid extraction. It gets recorded as a reason for human review and is never sent back for another try.

### What to notice, and why

| Problem | Retry helps? | Why |
| --- | --- | --- |
| Wrong date format | Yes | The information is there; the model formatted it wrong |
| Sum doesn't match line items | Yes | An arithmetic slip the model can redo |
| Value in the wrong field | Yes | A structural mistake |
| Field absent from the document | No | No amount of asking creates the data |
| Data lives in a separate document you didn't provide | No | Same reason. Route it or fetch the other document |

- **The retry carries three things.** The original document, the failed extraction, and the specific errors. All three are in the conversation: the document from the first message, the extraction as the assistant's tool call, and the errors as a `tool_result` marked `is_error`. "That was wrong, try again" with no detail gives the model nothing to act on.
- **Error messages are written as instructions.** "Do not change either number to make them agree" heads off the most likely bad fix, which is quietly editing a line item so the math works.
- **Tool use removes syntax errors, not semantic ones.** You never had to catch malformed JSON. Every failure you saw was about meaning. The exam draws exactly this line.
- **`calculated_total` next to `stated_total` is a self-check.** Asking the model to compute its own sum beside the printed one turns a hidden inconsistency into a field your code can test.
- **A conflict in the source is not an extraction error.** inv-004's totals really do disagree. The right output reports both numbers and sets `conflict_detected`. "Fixing" it would destroy the evidence.
- **Retries are bounded.** Two retries, then the record is marked failed and goes to a person. An unbounded loop on an unfixable document is how extraction bills get large.

## Step 5: Batch processing

The Message Batches API takes many requests at once, processes them in the background, and charges half price. The cost is time: a batch can take up to 24 hours and there's no guaranteed turnaround. You submit, you wait, you collect.

You'll run the same ten documents as a batch, with one deliberate failure to practice recovery.

Create `batch.py`:

```python
"""Step 5: the same extraction through the Message Batches API."""
import json
import sys
import time
from pathlib import Path

from extract import build_request, client, find_tool_use, load_docs
from pipeline import check, finish


def submit(docs: dict[str, str], max_tokens: int) -> str:
    batch = client.messages.batches.create(
        requests=[
            {"custom_id": doc_id, "params": build_request(text, max_tokens=max_tokens)}
            for doc_id, text in docs.items()
        ]
    )
    print(f"Submitted {len(docs)} requests as {batch.id}")
    return batch.id


def wait(batch_id: str, every_seconds: int = 30) -> None:
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        print(f"  {batch.processing_status}: {batch.request_counts}")
        if batch.processing_status == "ended":
            return
        time.sleep(every_seconds)


def collect(batch_id: str) -> tuple[list[dict], dict[str, str]]:
    """Return (finished records, {custom_id: why it needs another pass})."""
    done, failed = [], {}
    for entry in client.messages.batches.results(batch_id):
        doc_id = entry.custom_id
        if entry.result.type != "succeeded":
            failed[doc_id] = entry.result.type  # errored, canceled, or expired
            continue
        message = entry.result.message
        block = find_tool_use(message)
        if message.stop_reason == "max_tokens" or block is None:
            failed[doc_id] = "truncated"
            continue
        invoice, errors = check(block.input)
        if invoice:
            done.append(finish(doc_id, invoice, attempts=1))
        else:
            failed[doc_id] = "validation"
            print(f"  {doc_id} failed validation:\n{errors}")
    return done, failed


if __name__ == "__main__":
    docs = load_docs()

    # Pass 1: a deliberately tight max_tokens so the long invoice truncates.
    first = submit(docs, max_tokens=int(sys.argv[1]) if len(sys.argv) > 1 else 900)
    wait(first)
    done, failed = collect(first)
    print(f"Pass 1: {len(done)} ok, failed: {failed}")

    # Pass 2: resubmit ONLY the failures, with the fix each one needs.
    retry_docs = {doc_id: docs[doc_id] for doc_id, why in failed.items() if why != "validation"}
    if retry_docs:
        second = submit(retry_docs, max_tokens=8000)
        wait(second)
        more, still_failed = collect(second)
        done += more
        failed = {k: v for k, v in failed.items() if k not in retry_docs} | still_failed
        print(f"Pass 2: {len(more)} recovered, still failed: {failed}")

    done.sort(key=lambda record: record["id"])
    Path("results.json").write_text(json.dumps(done, indent=2))
    print(f"Wrote {len(done)} records to results.json")
```

Run it:

```bash
python batch.py
```

A small batch usually finishes in minutes, but nothing promises that. Leave it running.

Pass 1 gives every request 900 output tokens. That's plenty for a normal invoice and not enough for inv-008's forty line items, so it should come back `truncated`. Pass 2 resubmits that one document with a larger limit. If nothing truncates on your run, force it with a tighter limit: `python batch.py 500`.

### What to notice, and why

- **`custom_id` is how you match answers to questions.** Results don't come back in submission order. Each result carries the `custom_id` you assigned, and that's the only link to the original document. Here it's the document ID.
- **Resubmit only what failed.** Pass 2 sends one document, not ten. You identify failures by `custom_id` and apply the fix that failure needs: a higher token limit for truncation, chunking for a document that exceeded the context window.
- **"Succeeded" means the request ran, not that the answer is good.** inv-008 was a successful API call with a cut-off answer. You have to check `stop_reason` yourself. `max_tokens` there means the output was truncated.
- **A batch request is one turn.** There's no way to run a tool mid-request and send the result back. That's why this script can't use Step 4's retry loop inside the batch. Validation failures are collected and handled afterward, in a follow-up batch or with live calls.
- **Test the prompt on a sample first.** You refined the prompt in Steps 3 and 4 with live calls before batching. Finding a prompt problem after a 10,000-document batch means paying for it twice.

### When to use it

| Workload | API | Why |
| --- | --- | --- |
| Pre-merge check a developer is waiting on | Synchronous | Blocking. "Up to 24 hours" is unacceptable |
| Customer-facing extraction | Synchronous | Same |
| Overnight report, weekly audit, nightly test generation | Batch | Nobody is waiting; take the 50% saving |
| Backfill of a document archive | Batch | Large and latency-tolerant |

Sample Question 11 proposes moving both a blocking check and an overnight report to batch for the savings. The answer is to move only the overnight one. "Add a timeout fallback to real-time" is the distractor: it adds machinery to avoid picking the right API for each job.

### The SLA arithmetic

The exam asks you to work out how often to submit batches. The reasoning is worst-case:

- A document can wait for the next submission window, then for the batch to finish.
- Worst-case time = submission interval + 24 hours.
- If documents must be done within 30 hours of arriving, the interval can be at most 30 − 24 = 6 hours.

The guide's own example uses 4-hour windows for a 30-hour SLA, which leaves 2 hours of margin for collecting results and reprocessing failures. If a question gives you an SLA shorter than 24 hours, batch can't guarantee it at any interval.

## Step 6: Deciding what a human should check

No extraction pipeline is right every time, and people can't check everything. This step measures where the pipeline is wrong, tests whether the model's own confidence scores can be trusted, and uses both to send the right records to review.

You can do this because `labels.json` holds the correct answers. In production, that's a labeled validation set: a few hundred documents someone extracted by hand.

Create `review.py`:

```python
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
```

Run it against the results you already have:

```bash
python review.py
```

Then get the comparison you were promised in Step 3:

```bash
PROMPT=v1 python pipeline.py && python review.py     # baseline prompt
python pipeline.py && python review.py               # rules and examples
```

Ten documents is a toy sample, so don't read much into any single number. The method is what carries over.

### Reading the output

**Overall accuracy** is the number that goes in a slide, and the least useful one here.

**Accuracy by document type and field** is where problems show. A pipeline can be 96% accurate overall while getting every receipt date wrong, because receipts are a small share of the total. Look for a weak cell. inv-007's ambiguous date and the email documents are the likely spots.

**Calibration** tests whether the confidence scores mean anything. If fields the model rated 0.9 and up are right nearly every time, and lower-rated fields are right less often, the scores are informative and you can route on them. If high-confidence fields are wrong as often as the rest, the scores are noise.

**Routing** combines three triggers: a low-confidence field, a conflict in the source, and a required value that's absent. Change `THRESHOLD` to 0.7 and to 0.99 and rerun. Watch two things move in opposite directions: how many records go to review, and whether "Auto-approved records containing an error" stays empty. That trade is what you tune against the validation set.

**The stratified spot-check** picks auto-approved records for a human to check anyway, one from each document type. It will often say "none auto-approved" for emails here, since most of them lack a PO number.

### What to notice, and why

- **Aggregate accuracy hides segment failures.** Before you reduce human review, check accuracy for each document type and each field. A 97% headline can sit on top of a segment that's mostly wrong.
- **Confidence is per field, not per document.** A record can be certain about the vendor and shaky on the date. Field-level scores let a reviewer look at one value instead of rereading the whole invoice.
- **This is where self-reported confidence is legitimate.** In Build 1, escalating on the model's confidence was a trap. The difference is calibration: here the scores are checked against labeled data, and the threshold is set from what that shows. Raw, unvalidated confidence is still the wrong answer.
- **Sample the confident records too.** If you only ever review low-confidence output, you never learn when the model becomes confidently wrong, such as when a vendor changes its invoice layout. Ongoing random sampling of the auto-approved pile measures the real error rate and catches new failure patterns.
- **Stratify the sample.** A plain random sample mostly draws the common document type. Sampling within each type guarantees the rare ones get looked at.
- **Reviewer time is the scarce resource.** Routing exists to spend it on ambiguous or contradictory documents and low-confidence fields, and nowhere else.

## Step 7: Break it on purpose

Each experiment reproduces a failure the exam describes. Undo each change before the next.

### Experiment 1: Make an absent field required (task 4.3)

In `schema.py`, change `po_number: Optional[str]` to `po_number: str`. Run `python extract.py inv-005` several times.

The email never prints a PO number, and the schema now demands a string. Watch what fills the gap: a placeholder such as "N/A" or "on file," or a plausible-looking number. Any of those would flow into your accounting system as a real PO.

### Experiment 2: Close the enum (task 4.3)

Remove `"other"` and `"unclear"` from `payment_terms`. Run `python extract.py inv-006` and `python extract.py inv-009`.

inv-006 says "2/10 net 45" and inv-009 states no terms at all. With no honest option left, each gets the nearest wrong value, and nothing in the output tells you it was a guess.

### Experiment 3: Vague retry feedback (task 4.4)

In `pipeline.py`, replace the `content` of the `tool_result` with the string `"That was wrong. Try again."` Run `PROMPT=v1 python pipeline.py` and compare attempt counts and failures with your earlier `PROMPT=v1` run.

Without the specific errors, the model has to guess what was wrong. Some retries change a field that was fine.

### Experiment 4: Retry what can't be fixed (task 4.4)

In `check_semantics`, add a rule that treats a missing PO as an error:

```python
        if self.po_number is None:
            errors.append("po_number is required.")
```

Run `python pipeline.py`. The five invoices without a printed PO each burn three attempts. They end as `failed_validation`, or the model gives in and invents a PO to make the error stop. Count the wasted requests: up to ten extra calls on a ten-document run.

This is a common shape for an exam question: a field keeps failing validation after several retries, and the data turns out not to be in the source. Retries are the wrong tool for that.

### Experiment 5: Feel the latency (task 4.5, Sample Question 11)

```bash
time python pipeline.py
time python batch.py
```

The live pipeline finishes in a predictable minute or so. The batch finishes when it finishes. Imagine a developer waiting on that second number before they can merge.

## Checklist and exam mapping

- [ ] I can explain why tool use with a JSON schema is the reliable route to structured output (4.3)
- [ ] I can say what a schema guarantees and what it doesn't (4.3, 4.4)
- [ ] I can state what `auto`, `any`, and forced `tool_choice` each guarantee (2.3, 4.3)
- [ ] I know when `any` is the right setting (4.3)
- [ ] I used nullable fields and can explain how they prevent fabrication (4.3)
- [ ] I used `other` plus a detail field, and `unclear`, and can say how they differ (4.3)
- [ ] I wrote few-shot examples aimed at ambiguous cases, with reasoning (4.2)
- [ ] I paired normalization rules in the prompt with a strict schema (4.3)
- [ ] My retry sends the document, the failed extraction, and the specific errors (4.4)
- [ ] I can tell which failures a retry can fix and which it can't (4.4)
- [ ] I extract `calculated_total` beside `stated_total` and flag conflicts (4.4)
- [ ] I ran a batch, matched results by `custom_id`, and resubmitted only failures (4.5)
- [ ] I can do the batch SLA arithmetic (4.5)
- [ ] I can say which workloads belong on batch and which don't (4.5)
- [ ] I measured accuracy by document type and field, not just overall (5.5)
- [ ] I checked confidence scores against labeled data before routing on them (5.5)
- [ ] I can explain stratified sampling of high-confidence records (5.5)
- [ ] I ran the five experiments in Step 7

### Where the guide and current tooling differ

The exam guide is version 0.1 from February 2025. Answer the guide's way on the exam.

| Topic | Exam guide says | Current SDK (anthropic 2.10.0) |
| --- | --- | --- |
| `stop_reason` values | `tool_use` and `end_turn`, plus `max_tokens` in the appendix | Also `stop_sequence`, `pause_turn`, `refusal`, and `model_context_window_exceeded` |
| Structured output | Tool use with a JSON schema | Tool definitions also accept a `strict` flag, and `messages.create` has an `output_config` parameter. Both exist in the SDK; neither was tested for this guide |

**Forced tool choice is the biggest difference.** The guide treats `any` and a named tool as available everywhere, and that's what to answer on the exam. On current flagship models both return a 400. The replacement there is `tool_choice: {"type": "auto"}`, `"strict": True` on the tool so its input must match the schema, a prompt that says when to call it, and code that checks a tool call actually happened. Once the build works on an older model, switching `FORCED` to `{"type": "auto"}`, adding `strict`, and rerunning on a current model is a worthwhile extra experiment.

### How far this was tested

- `make_samples.py`, `schema.py`, and the Step 4a snippet were run as written. The schema generates as described and the validator produces the errors shown.
- `pipeline.py`, the batch result handling in `batch.py`, and `review.py` were run end to end against a stand-in for the API that returned canned responses, including a format error, an unfixable error, a truncated result, and an errored result. The retry message structure, failure sorting, and all of `review.py`'s output paths behaved as described.
- The batch method names and result fields were read from the installed SDK.
- Nothing was run against the live API. What the model actually returns for each document, how often retries fire, and whether 900 tokens truncates only inv-008 are expectations, not observations.

### Sources

- The `anthropic` Python SDK, version 2.10.0, inspected directly: `messages.create`, `messages.batches.create`, `retrieve`, and `results`, the batch result types, the tool parameter fields, and the `stop_reason` values
- `pydantic` 2.14.3, run directly
- Claude Certified Architect – Foundations Certification Exam Guide, v0.1: task statements 4.2 to 4.5 and 5.5, Scenario 6, and Sample Question 11
