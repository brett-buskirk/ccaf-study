"""Builds one extraction request. Shared by the live pipeline and the batch job."""
import os
from pathlib import Path

import anthropic

from schema import EXTRACT_TOOL

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
MODEL = os.environ.get("MODEL", "claude-haiku-4-5")  # must accept forced tool_choice; see Setup

SYSTEM_V1 = "Extract the invoice fields from the document by calling record_invoice."

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
