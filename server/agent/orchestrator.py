"""Hermes Agent — Orchestrator

Manages the agent task loop: receive state → plan action → return action.
The extension handles execution and sends results back.
"""

import logging
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
        }
        # Record the result in session history
        session.add_result(request.step - 1, request.last_action)

    # Plan next action using LLM
    response = await plan_next_action(
        request,
        last_action_result=last_action_result,
        conversation_history=session.get_history_for_llm(),
    )

    # Record the planned action in session history
    session.add_action(response.action, response.reasoning)
    session.current_step = request.step
    session.last_request = request

    # Mark done if LLM says so
    if response.done:
        session.mark_done(response.message)
        logger.info(f"Session {session.session_id} completed: {response.message}")

    logger.info(
        f"Step {request.step} response: action={response.action.action}, "
        f"target={response.action.target}, done={response.done}"
    )

    return response
