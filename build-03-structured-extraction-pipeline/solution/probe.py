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
