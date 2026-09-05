"""Hermes Agent — LLM Planner

Builds prompts from sanitized state and calls the LLM to get the next action.
Supports any OpenAI-compatible API (Ollama, OpenRouter, Groq, DeepSeek, OpenAI).
"""

import asyncio
import json
import logging
import os
import time
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

logger = logging.getLogger("hermes.planner")

PROMPTS_DIR = Path(__file__).parent / "prompts"

# Roles the agent can actually operate on. Links matter for navigation but are
# rarely the typing target, so they rank lower when trimming heavy pages.
_FIELD_ROLES = {"textbox", "select", "checkbox", "radio"}
_BUTTON_ROLE = "button"
_LINK_ROLE = "link"

# Minimal stopword list for task↔label overlap scoring.
_STOP = frozenset(
    "the and with that this from your into have been would could should about there "
    "their what when where which while them then than they were was just but want need "
    "please tell give make over more some such each other these those being does did "
    "you can are its our him her his out not all any who why how too very also do for "
    "click fill type enter put add set change using use want form sign submit login log".split()
)


def _label_words(s: str) -> set:
    """Content-bearing words from a label/task for overlap scoring."""
    words = set()
    for w in (s or "").lower().split():
        w = w.strip("'’\".,;:!?()[]")
        if len(w) > 3 and w not in _STOP:
            words.add(w)
    return words


def trim_elements_for_llm(
    elements: list[SanitizedElement], task: str, limit: int
) -> list[SanitizedElement]:
    """Return the elements worth showing the LLM, capped at `limit`.

    Heavy pages (chat sites, marketplaces) can expose 100+ elements; feeding all
    of them to a local model makes every step slow and unfocused. Scoring:
    interactive fields first, visible ones next, then how strongly the label
    OR the context anchor overlaps the task ("play" + context "Inception"
    keeps the Inception button even though the raw label is generic). Hidden or
    non-interactive noise is dropped, and anything the task clearly names is
    always kept.
    """
    if limit <= 0 or len(elements) <= limit:
        return list(elements)

    task_words = _label_words(task)

    def score(el: SanitizedElement) -> tuple:
        role = (el.role or "").lower()
        label = _label_words(el.label) | _label_words(el.context)
        overlap = label & task_words

        s = 0.0
        if role in _FIELD_ROLES:
            s += 4.0
        elif role == _BUTTON_ROLE:
            s += 3.0
        elif role == _LINK_ROLE:
            s += 1.0
        else:
            s -= 2.0
        if el.visible is False:
            s -= 4.0  # hidden elements can't be acted on reliably
        else:
            s += 1.0
        if overlap:
            s += 4.0 + min(len(overlap), 4)  # task explicitly names it → keep
        if role == _LINK_ROLE and not overlap:
            s -= 2.0  # navigation links only matter when the task mentions them
        return (-s,)

    scored = sorted(enumerate(elements), key=lambda t: (score(t[1]), t[0]))
    kept = [el for _, el in scored[:limit]]
    # Restore page order so the LLM sees a natural reading order.
    kept.sort(key=lambda el: next(i for i, e in enumerate(elements) if e is el))
    return kept


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
    # Context disambiguation: which card/group this element belongs to
    # ("play" buttons under different movie titles become distinguishable).
    if el.context:
        result["context"] = el.context
    if el.ambiguous:
        result["ambiguous"] = True
    return result


def build_step_prompt(
    request: AgentStepRequest,
    last_action_result: Optional[dict] = None,
) -> str:
    """Build the user message for the LLM from the current state."""
    template = load_prompt("step")

    # Trim heavy pages before formatting: the LLM only needs the elements that
    # are interactive, visible, or named by the task — not 120 DOM nodes.
    config = get_config()
    all_elements = request.sanitized_state.elements
    shown = trim_elements_for_llm(all_elements, request.task, config.llm_max_elements)
    if len(shown) < len(all_elements):
        logger.info(
            f"Trimmed {len(all_elements)} elements -> {len(shown)} for the LLM "
            "(hidden / non-interactive / off-task noise removed)"
        )

    # Format elements
    elements = [format_element_for_llm(el) for el in shown]
    elements_json = json.dumps(elements, indent=2)

    # Ambiguity warning: duplicated controls that could not be disambiguated.
    # The LLM must not guess blindly between them — better to ask.
    ambiguous_ids = [el.id for el in shown if el.ambiguous]
    if ambiguous_ids:
        ambiguity_note = (
            "## Ambiguity Warning\n"
            "These elements share the same role, label AND context — they are "
            "indistinguishable from the page structure alone:\n"
            + ", ".join(ambiguous_ids)
            + "\nIf your next action must target one of them, do NOT guess. "
            "Plan the action that disambiguates first (e.g. navigate to the item "
            "via its unique titled link/card, then act on the single control "
            "there) or set `\"done\": true` and ask the user which one they mean.\n"
        )
    else:
        ambiguity_note = ""

    # Build last action section
    last_action_section = ""
    if last_action_result:
        last_action_section = f"""## Last Action Result
```json
{json.dumps(last_action_result, indent=2)}
```
Your previous action is shown above. If it succeeded (success: true), DO NOT plan the same action again — either plan a DIFFERENT next action or set `"done": true` in your response if the task is finished."""

    prompt = template.format(
        task=request.task,
        step=request.step,
        max_steps=20,
        elements_json=elements_json,
        page_title=request.sanitized_state.page_info.title,
        page_url=request.sanitized_state.page_info.url,
        page_domain=request.sanitized_state.page_info.domain,
        shown_elements=len(shown),
        total_elements=request.sanitized_state.stats.get("total", 0),
        passed=request.sanitized_state.stats.get("passed", 0),
        pseudonymized=request.sanitized_state.stats.get("pseudonymized", 0),
        redacted=request.sanitized_state.stats.get("redacted", 0),
        omitted=request.sanitized_state.stats.get("omitted", 0),
        protected=request.sanitized_state.stats.get("protected", 0),
        last_action_section=last_action_section,
        ambiguity_note=ambiguity_note,
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

    # Keep the local model warm between loop steps (Ollama supports this;
    # cloud providers ignore the extra field)
    if config.llm_provider == "ollama" and config.llm_keep_alive:
        payload["keep_alive"] = config.llm_keep_alive

    # Generous per-phase timeouts. Connect is short; read/write must cover
    # cold model load + token generation on local hardware.
    timeout = httpx.Timeout(
        connect=10.0,
        read=config.llm_timeout,
        write=config.llm_timeout,
        pool=config.llm_timeout,
    )

    t0 = time.monotonic()
    last_err: Optional[Exception] = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()

            elapsed = time.monotonic() - t0
            usage = data.get("usage") or {}
            logger.info(
                f"LLM call OK in {elapsed:.1f}s (attempt {attempt + 1}/3) — "
                f"prompt_tokens={usage.get('prompt_tokens', '?')} "
                f"completion_tokens={usage.get('completion_tokens', '?')}"
            )

            # Extract content from OpenAI-compatible response
            content = data["choices"][0]["message"]["content"]

            # Strip markdown code fences if present. Only remove the OPENING
            # fence line, then drop a trailing closing fence IF one exists —
            # never slice lines[1:-1] blindly, because a model that forgets the
            # closing ``` would lose its final JSON brace (or all content).
            content = content.strip()
            if content.startswith("```"):
                newline = content.find("\n")
                if newline == -1:
                    content = ""
                else:
                    content = content[newline + 1 :].strip()
                    if content.endswith("```"):
                        content = content[:-3].rstrip()

            return content
        except httpx.TimeoutException as e:
            last_err = e
            logger.warning(f"LLM request timed out (attempt {attempt + 1}/3): {e}")
            if attempt < 2:
                await asyncio.sleep(2 * (attempt + 1))

    raise RuntimeError(
        f"LLM request timed out after 3 attempts ({config.llm_timeout}s each). "
        f"The model '{config.llm_model}' may still be loading — check `ollama list` "
        f"and `ollama ps`. {last_err}"
    )


def parse_action_response(raw: str) -> dict:
    """Parse the LLM response into an action dict.

    Small models frequently wrap the JSON in prose or emit a SECOND JSON object
    / commentary after the action. A strict json.loads() rejects that with
    "Extra data". Instead we scan for the FIRST JSON object that looks like an
    action (has an "action" key) and ignore everything else — logging a warning
    so the verbosity is visible in the server log.
    """
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("LLM response was empty.")

    decoder = json.JSONDecoder()
    idx = 0
    scanned = 0
    while idx < len(raw) and scanned < 10:
        try:
            obj, end = decoder.raw_decode(raw, idx)
        except json.JSONDecodeError:
            # Leading prose / garbage — jump to the next '{' and try again.
            nxt = raw.find("{", idx + 1)
            if nxt == -1:
                break
            idx = nxt
            continue
        scanned += 1
        candidates: list = [obj] if isinstance(obj, dict) else (obj if isinstance(obj, list) else [])
        for cand in candidates:
            if isinstance(cand, dict) and "action" in cand:
                trailing = raw[end:].strip()
                if trailing:
                    logger.warning(
                        "LLM response had extra content after the action JSON "
                        "(discarding %d trailing chars): %r", len(trailing), trailing[:160]
                    )
                return cand
        # Valid JSON but not an action (a list without actions, an unrelated
        # object, a scalar) — keep scanning for the real action object.
        idx = end + 1

    raise ValueError(
        "Could not parse LLM response as an action JSON object. "
        f"Raw response: {raw[:300]}"
    )


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
    try:
        data = parse_action_response(raw_response)
    except ValueError as e:
        # One corrective retry — models usually fix output when told exactly
        # what went wrong. Only retry once; a second failure is a real problem.
        logger.warning(f"LLM response unparseable; retrying once with corrective hint: {e}")
        raw_response = await call_llm(
            system_prompt,
            user_prompt
            + "\n\nYour previous response could not be parsed as a single action JSON "
            "object (it had extra text or a second object after the JSON). Respond with "
            "ONLY one valid JSON object matching the required format — no prose, no "
            "explanation, no code fences, no second object.",
        )
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
    """Fallback mock for testing without any LLM.
    Produces a basic action from the first interactive element.
    """
    import re

    # Parse the elements from the prompt
    try:
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

    # Simple: find first clickable/textable element and return it
    for el in elements:
        role = el.get("role", "")
        treatment = el.get("treatment", "")
        if treatment in ("omit", "redact"):
            continue
        if role == "textbox":
            return json.dumps({
                "action": "type",
                "target": el["id"],
                "params": {"text": "test"},
                "reasoning": f"[mock] Typing into {el.get('label', el['id'])}.",
            })
        if role == "button":
            return json.dumps({
                "action": "click",
                "target": el["id"],
                "params": {},
                "reasoning": f"[mock] Clicking {el.get('label', el['id'])}.",
                "done": True,
            })

    return json.dumps({
        "action": "wait",
        "target": None,
        "params": {"duration": 1000},
        "reasoning": "[mock] No actionable elements found.",
        "done": True,
    })
