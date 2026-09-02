"""Hermes Agent — LLM Planner

Builds prompts from sanitized state and calls the LLM to get the next action.
Supports any OpenAI-compatible API (Ollama, OpenRouter, Groq, DeepSeek, OpenAI).
"""

import json
import os
from pathlib import Path
from typing import Optional

import httpx

from server.config import get_config
from server.models.schemas import (
    AgentStepRequest,
    AgentStepResponse,
    Action,
    SanitizedElement,
)

PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str) -> str:
    """Load a prompt template from the prompts directory."""
    return (PROMPTS_DIR / f"{name}.txt").read_text()


def format_element_for_llm(el: SanitizedElement) -> dict:
    """Format a sanitized element for the LLM prompt."""
    result = {
        "id": el.id,
        "role": el.role,
        "label": el.label,
        "visible": el.visible,
        "sensitivity": el.sensitivity,
        "relevance": el.relevance,
        "treatment": el.treatment,
    }
    if el.value:
        result["value"] = el.value
    if el.status:
        result["status"] = el.status
    if el.original_data_type:
        result["dataType"] = el.original_data_type
    return result


def build_step_prompt(
    request: AgentStepRequest,
    last_action_result: Optional[dict] = None,
) -> str:
    """Build the user message for the LLM from the current state."""
    template = load_prompt("step")

    # Format elements
    elements = [format_element_for_llm(el) for el in request.sanitized_state.elements]
    elements_json = json.dumps(elements, indent=2)

    # Build last action section
    last_action_section = ""
    if last_action_result:
        last_action_section = f"""## Last Action Result
```json
{json.dumps(last_action_result, indent=2)}
```
Was the action successful? What should you do next?"""

    prompt = template.format(
        task=request.task,
        step=request.step,
        max_steps=20,
        elements_json=elements_json,
        page_title=request.sanitized_state.page_info.title,
        page_url=request.sanitized_state.page_info.url,
        page_domain=request.sanitized_state.page_info.domain,
        total_elements=request.sanitized_state.stats.get("total", 0),
        passed=request.sanitized_state.stats.get("passed", 0),
        pseudonymized=request.sanitized_state.stats.get("pseudonymized", 0),
        redacted=request.sanitized_state.stats.get("redacted", 0),
        omitted=request.sanitized_state.stats.get("omitted", 0),
        protected=request.sanitized_state.stats.get("protected", 0),
        last_action_section=last_action_section,
    )

    return prompt


async def call_llm(system_prompt: str, user_prompt: str) -> str:
    """Call the LLM API. Returns the raw response text."""
    config = get_config()

    if config.llm_provider == "mock":
        return mock_response(user_prompt)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    headers = {"Content-Type": "application/json"}
    if config.llm_api_key:
        headers["Authorization"] = f"Bearer {config.llm_api_key}"

    # OpenAI-compatible chat completions endpoint
    url = f"{config.llm_base_url.rstrip('/')}/chat/completions"

    payload = {
        "model": config.llm_model,
        "messages": messages,
        "max_tokens": config.llm_max_tokens,
        "temperature": config.llm_temperature,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    # Extract content from OpenAI-compatible response
    content = data["choices"][0]["message"]["content"]

    # Strip markdown code fences if present
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        # Remove first and last lines (```json and ```)
        content = "\n".join(lines[1:-1])

    return content


def parse_action_response(raw: str) -> dict:
    """Parse the LLM response into an action dict."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Try to find JSON in the response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(raw[start:end])
        else:
            raise ValueError(f"Could not parse LLM response as JSON: {raw[:200]}")

    return data


async def plan_next_action(
    request: AgentStepRequest,
    last_action_result: Optional[dict] = None,
    conversation_history: Optional[list[dict]] = None,
) -> AgentStepResponse:
    """Plan the next action given the current state.

    This is the main entry point for the planner.
    """
    system_prompt = load_prompt("system")
    user_prompt = build_step_prompt(request, last_action_result)

    # Add conversation history if available (for multi-step reasoning)
    if conversation_history:
        # Append history to system prompt
        history_text = "\n\n## Conversation History\n"
        for entry in conversation_history[-6:]:  # Last 3 exchanges
            history_text += f"\n### Step {entry.get('step', '?')}\n"
            history_text += f"Action: {json.dumps(entry.get('action', {}))}\n"
            history_text += f"Result: {'Success' if entry.get('success') else 'Failed: ' + str(entry.get('error', ''))}\n"
        system_prompt += history_text

    # Call LLM
    raw_response = await call_llm(system_prompt, user_prompt)

    # Parse response
    data = parse_action_response(raw_response)

    # Build response
    action = Action(
        action=data.get("action", "wait"),
        target=data.get("target"),
        params=data.get("params"),
        reasoning=data.get("reasoning", ""),
    )

    done = data.get("done", False)
    message = data.get("message")

    return AgentStepResponse(
        action=action,
        reasoning=data.get("reasoning", "No reasoning provided"),
        step=request.step,
        done=done,
        message=message,
        session_id=request.session_id or "default",
    )


def mock_response(user_prompt: str) -> str:
    """Mock LLM response for testing without an API key.
    Analyzes the elements and produces a reasonable action.
    """
    # Parse the elements from the prompt
    try:
        # Find the elements JSON in the prompt
        start = user_prompt.find("[")
        end = user_prompt.find("]", user_prompt.find("Page Elements")) + 1
        if start >= 0 and end > start:
            elements = json.loads(user_prompt[start:end])
        else:
            elements = []
    except (json.JSONDecodeError, ValueError):
        elements = []

    # Find the task
    task_start = user_prompt.find("## Current Task\n")
    task = ""
    if task_start >= 0:
        task = user_prompt[task_start + 17 : user_prompt.find("\n", task_start + 17)]

    # Simple heuristic: find the first text input and type something,
    # or find a submit button and click it
    for el in elements:
        role = el.get("role", "")
        label = el.get("label", "").lower()
        treatment = el.get("treatment", "")

        # Skip omitted/redacted elements
        if treatment in ("omit", "redact"):
            continue

        # Find text inputs for the task
        if role == "textbox" and treatment in ("pass", "pseudonymize"):
            text_to_type = _guess_input_value(label, task)
            return json.dumps({
                "action": "type",
                "target": el["id"],
                "params": {"text": text_to_type},
                "reasoning": f"Typing '{text_to_type}' into {el.get('label', el['id'])} field.",
            })

        # Find submit buttons
        if role == "button" and ("submit" in label or "book" in label or "send" in label or "save" in label):
            return json.dumps({
                "action": "click",
                "target": el["id"],
                "params": {},
                "reasoning": f"Clicking '{el.get('label', el['id'])}' to submit the form.",
                "done": True,
                "message": f"Task complete: clicked {el.get('label', 'submit button')}.",
            })

    # Default: scroll down to see more
    return json.dumps({
        "action": "scroll",
        "target": None,
        "params": {"direction": "down", "amount": 300},
        "reasoning": "Scrolling down to see more page elements.",
    })


def _guess_input_value(label: str, task: str) -> str:
    """Guess what to type based on the field label and task."""
    label_lower = label.lower()

    if "name" in label_lower:
        return "Rahul Sharma"
    if "email" in label_lower:
        return "rahul@gmail.com"
    if "phone" in label_lower:
        return "+91 98765 43210"
    if "date" in label_lower:
        return "2026-09-02"
    if "time" in label_lower:
        return "morning"
    if "department" in label_lower:
        return "cardiology"
    if "note" in label_lower or "comment" in label_lower:
        return "Regular checkup"

    return "test value"
