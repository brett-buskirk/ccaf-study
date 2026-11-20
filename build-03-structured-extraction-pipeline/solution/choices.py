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
