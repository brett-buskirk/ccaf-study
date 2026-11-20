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
