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
