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
