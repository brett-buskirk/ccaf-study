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
