"""Hermes Agent — Orchestrator

Manages the agent task loop: receive state → plan action → return action.
The extension handles execution and sends results back.
"""

import logging
import re
from typing import Optional

from server.config import get_config
from server.models.schemas import (
    AgentStepRequest,
    AgentStepResponse,
    ActionResult,
)
from server.agent.planner import plan_next_action
from server.agent.state import get_session_manager, Session

logger = logging.getLogger("hermes.orchestrator")

# Privacy placeholders the LLM may echo but must never type as real values.
_TOKEN_RE = re.compile(r"^<[A-Z][A-Z0-9_]*_\d+>$")
_REDACT_RE = re.compile(r"^\[REDACTED_[A-Z_]+\]$")

# Fields whose content is structured DATA (never composed prose, never invented).
_DATA_FIELD_RE = re.compile(
    r"\b(e-?mail|mail|phone|mobile|telephone|roll\s*number|registration\s*number|"
    r"(student|employee|id)\s*id|ssn|pincode|postal\s*code|zip|url|website|"
    r"account\s*number|card\s*number|address|date\s*of\s*birth|dob)\b"
)
# Values that LOOK like structured personal data (vs. composed prose).
_DATA_VALUE_RE = re.compile(r"^\+?[0-9][0-9\s()./_-]{6,}$")  # phone-like digit run
_EMAIL_VALUE_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_VALUE_RE = re.compile(r"^(https?://|www\.)", re.IGNORECASE)

# A task is GENERATIVE when the user asks the agent to AUTHOR text
# ("answer/why ... in 50 words", "write an intro") rather than insert a
# value the user supplied ("fill email with X").
_GENERATIVE_VERB_RE = re.compile(
    r"\b(answer|respond|reply|write|draft|compose|describe|explain|summarize|express|"
    r"elaborate|justify|introduce|tell|share|state|say)\b"
)
_LENGTH_LIMIT_RE = re.compile(
    r"\b(in|of|within|under)\s+(about\s+)?\d+(\s*[-–]\s*\d+)?\s*"
    r"(words?|characters?|chars?|sentences?|paragraphs?)\b"
)
_QUESTION_LEAD_RE = re.compile(r"^(why|what|how|when|where|who|which)\b")
_QUESTION_LABEL_RE = re.compile(r"[?？]|^(why|what|how|when|where|who|which)\b")

_STOPWORDS = frozenset(
    "with that this from your into have been would could should about there their "
    "what when where which while them then than they were was just but want need "
    "please tell give make over more some such each other these those being does ".split()
)


def _norm(s: str) -> str:
    """Normalize text for substring checks: lowercase, collapse whitespace."""
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def _meaningful_words(s: str) -> set:
    """Lowercased, content-bearing words (len > 3, not stopwords) for overlap checks."""
    out = set()
    for w in re.findall(r"[a-z0-9][a-z0-9'’-]*", _norm(s)):
        w = w.strip("'’-")
        if len(w) > 3 and w not in _STOPWORDS:
            out.add(w)
    return out


def _is_generative_task(task: str) -> bool:
    """True when the task asks the agent to author text rather than insert a value."""
    t = _norm(task or "")
    if not t:
        return False
    if _LENGTH_LIMIT_RE.search(t):
        return True
    if _QUESTION_LEAD_RE.match(t):
        return True
    return bool(_GENERATIVE_VERB_RE.search(t))


def veto_unsafe_action(request: AgentStepRequest, response: AgentStepResponse) -> Optional[str]:
    """Return a human-readable block reason if the planned action is unsafe.

    Guards against LLM hallucinations that would write fabricated data into
    real (possibly protected) form fields, while still allowing the agent to
    COMPOSE answers when the task asks it to write something:
      1. Privacy placeholders (<PERSON_1>, [REDACTED_PHONE]) are not values → block.
      2. Values must come from the task. Exception: when the task is GENERATIVE
         ("answer why you want to join NOVA in 50 words"), composed prose is
         allowed — but only into a field that clearly poses that question
         (its label is a question or shares the task's topic).
      3. Composed prose is never allowed in DATA fields (email/phone/ID/URL/…)
         and invented structured data (phone numbers, emails) is always blocked.
      4. Writes into pre-filled / protective_proxy fields the task never
         mentioned would overwrite real user data → block.

    Returns None when the action is safe to execute.
    """
    if response.done:
        return None

    action = response.action
    if action.action != "type":
        return None

    params = action.params
    text = (params.text or "").strip() if params else ""
    if not text:
        return None

    # 1) Never type privacy placeholders — the real value is hidden server-side.
    if _TOKEN_RE.match(text) or _REDACT_RE.match(text):
        return (
            f"Refusing to type placeholder '{text}' into {action.target or 'a field'} — "
            "its real value is hidden from the agent. Tell me the actual value to use."
        )

    task_norm = _norm(request.task or "")
    text_norm = _norm(text)
    appears_in_task = bool(task_norm) and bool(text_norm) and text_norm in task_norm

    target_el = next(
        (e for e in request.sanitized_state.elements if e.id == action.target), None
    )
    label = _norm(target_el.label or "") if target_el else ""
    label_words = _meaningful_words(label)
    task_words = _meaningful_words(request.task or "")
    label_mentioned = bool(label_words and task_words and label_words & task_words)
    protected = bool(
        target_el
        and (target_el.status == "pre-filled" or target_el.treatment == "protective_proxy")
    )
    data_field = bool(label and _DATA_FIELD_RE.search(label))
    data_like_value = bool(
        _DATA_VALUE_RE.match(text) or _EMAIL_VALUE_RE.match(text) or _URL_VALUE_RE.match(text)
    )
    clip = text if len(text) <= 80 else text[:77] + "…"

    # 2) Value came straight from the task → fine, except never overwrite a
    #    pre-filled / protected field the task didn't point at.
    if appears_in_task:
        if protected and not label_mentioned:
            return (
                f"Refusing to type '{clip}' into '{target_el.label}' ({target_el.id}) — "
                "it is pre-filled or protected and your task does not ask to change it."
            )
        return None

    # 3) Data fields always demand a value from the task — never composed prose.
    if data_field:
        return (
            f"Refusing to type '{clip}' into '{target_el.label or action.target}' — that is "
            "a data field (email/phone/ID/address/…) and the value must come from your task. "
            "Tell me the value to use."
        )

    # 4) Never let composed text smuggle in invented structured data.
    if data_like_value:
        return (
            f"Refusing to type '{clip}' — this looks like personal data (phone number, email, "
            "URL…) but does not appear in your task, so it would be invented. "
            "Tell me the value to use."
        )

    # 5) Pre-filled / protected fields stay off-limits unless the task mentions them.
    if protected and not label_mentioned:
        return (
            f"Refusing to type into '{target_el.label}' ({target_el.id}) — it is "
            "pre-filled or protected and your task does not ask to change it."
        )

    # 6) Remaining text is invented: only legitimate when the task asked the
    #    agent to AUTHOR an answer, and only into the field that poses the
    #    question (question-mark label or topic overlap with the task).
    if not _is_generative_task(request.task):
        return (
            f"Refusing to type '{clip}' — this value does not appear in your task, "
            "so I would be inventing data. Tell me the value to use instead."
        )
    question_label = bool(_QUESTION_LABEL_RE.search(label))
    if question_label or (label_words and task_words and label_words & task_words):
        return None
    return (
        f"Refusing to type my own answer into '{target_el.label if target_el else action.target}' "
        "— I can't confirm that is the field your question refers to. Tell me which field "
        "to fill, or include the question text in your task."
    )


async def process_step(
    request: AgentStepRequest,
) -> AgentStepResponse:
    """Process a single agent step.

    The extension sends the current sanitized state + task, and this
    function returns the next action to execute.
    """
    session_mgr = get_session_manager()
    session = session_mgr.get_or_create_session(
        request.session_id, request.task
    )

    logger.info(
        f"Step {request.step}: task='{request.task[:50]}...', "
        f"elements={len(request.sanitized_state.elements)}, "
        f"session={session.session_id}"
    )

    # Check if we've exceeded max steps
    if request.step >= get_config().max_steps:
        logger.warning(f"Max steps reached for session {session.session_id}")
        return AgentStepResponse(
            action={"action": "wait", "params": {"duration": 1000}},
            reasoning="Maximum steps reached. Task may need human intervention.",
            step=request.step,
            done=True,
            message="Maximum steps reached. Please complete the task manually.",
            session_id=session.session_id,
        )

    # Check if task is already done
    if session.done:
        return AgentStepResponse(
            action={"action": "wait", "params": {"duration": 1000}},
            reasoning="Task already completed.",
            step=request.step,
            done=True,
            message="Task already completed.",
            session_id=session.session_id,
        )

    # Build last action result if provided
    last_action_result = None
    if request.last_action:
        last_action_result = {
            "success": request.last_action.success,
            "action": request.last_action.action,
            "target": request.last_action.target,
            "error": request.last_action.error,
            "verified": request.last_action.verified,
        }
        # The extension now verifies by reading the DOM back, so it KNOWS the
        # action took effect. Surface this to the LLM so it doesn't re-type.
        if request.last_action.verified is None:
            last_action_result.pop("verified", None)
        elif request.last_action.actual_value is not None:
            last_action_result["actualValue"] = request.last_action.actual_value
        # Record the result in session history
        session.add_result(request.step - 1, request.last_action)

    # Plan next action using LLM
    response = await plan_next_action(
        request,
        last_action_result=last_action_result,
        conversation_history=session.get_history_for_llm(),
    )

    # Record the planned action in session history. Set current_step BEFORE
    # recording so entries carry the correct step number (add_result matches
    # on it).
    session.current_step = request.step
    session.add_action(response.action, response.reasoning)
    session.last_request = request

    # CRITICAL: the planner doesn't know the real session id (it falls back to
    # "default" when the request has none). Patch it so the extension sends back
    # the ACTUAL session id next step — otherwise every step creates a fresh
    # session, `session.done` never persists, and history is always empty.
    response.session_id = session.session_id

    # Safety guard: veto hallucinated actions (fabricated values, privacy
    # placeholders, overwriting protected fields) BEFORE they reach the page.
    block_reason = veto_unsafe_action(request, response)
    if block_reason:
        logger.warning(
            f"Session {session.session_id}: vetoed unsafe action "
            f"({response.action.action} -> {response.action.target}): {block_reason}"
        )
        response.done = True
        response.message = block_reason
        response.reasoning = block_reason

    # Repetition guard: the privacy engine hides values of omitted/redacted
    # fields, so after filling e.g. a Roll Number field the LLM re-inspects and
    # still sees "no value" → it plans the SAME action again forever. If the
    # previous identical action already succeeded, stop instead of re-executing.
    if not response.done and len(session.history) >= 2:
        prev_entry = session.history[-2]
        prev_ok = prev_entry.result and prev_entry.result.get("success", False)
        if prev_ok:
            prev_params = prev_entry.action.get("params") or {}
            cur_params = response.action.params.model_dump() if response.action.params else {}
            same_action = (
                prev_entry.action.get("action") == response.action.action
                and prev_entry.action.get("target") == response.action.target
                and prev_params == cur_params
            )
            if same_action and response.action.action not in ("wait", "scroll", "navigate"):
                response.done = True
                response.message = (
                    "The previous identical action already succeeded — "
                    "stopping to avoid repeating it."
                )
                response.reasoning = response.message
                logger.info(
                    f"Session {session.session_id}: repetition guard triggered "
                    f"(action={response.action.action}, target={response.action.target})"
                )

    # Mark done if LLM says so
    if response.done:
        session.mark_done(response.message)
        logger.info(f"Session {session.session_id} completed: {response.message}")

    logger.info(
        f"Step {request.step} response: action={response.action.action}, "
        f"target={response.action.target}, done={response.done}"
    )

    return response
