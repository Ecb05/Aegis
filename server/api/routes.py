"""Hermes Server — API Routes

HTTP endpoints for the extension to communicate with the server.
"""

import logging
import httpx
from fastapi import APIRouter, HTTPException

from server.config import get_config
from server.models.schemas import (
    AgentStepRequest,
    AgentStepResponse,
    HealthResponse,
    SessionCreateRequest,
    SessionCreateResponse,
    SessionStatusResponse,
    ActionResult,
)
from server.agent.orchestrator import process_step
from server.agent.state import get_session_manager

logger = logging.getLogger("hermes.api")

router = APIRouter(prefix="/agent", tags=["agent"])


# ─── Health ─────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    config = get_config()
    return HealthResponse(
        status="ok",
        provider=config.llm_provider,
        model=config.llm_model,
        version="0.1.0",
    )


# ─── Agent Step (Main Endpoint) ────────────────────────────

@router.post("/step", response_model=AgentStepResponse)
async def agent_step(request: AgentStepRequest):
    """Process one agent step.

    The extension sends:
    - Sanitized browser state (elements, page info, privacy stats)
    - User's task description
    - Current step number
    - Result of last action (if any)
    - Session ID (for multi-step continuity)

    The server returns:
    - The next action to execute
    - Reasoning for the action
    - Whether the task is done
    - Session ID
    """
    try:
        # Log what the server receives (sanitized, no raw PII)
        logger.info("=".ljust(60))
        logger.info("RECEIVED FROM EXTENSION:")
        logger.info(f"  Task: {request.task}")
        logger.info(f"  Step: {request.step}")
        logger.info(f"  Elements: {len(request.sanitized_state.elements)}")
        logger.info(f"  Page: {request.sanitized_state.page_info.title}")
        logger.info(f"  URL: {request.sanitized_state.page_info.url}")
        logger.info(f"  Stats: {request.sanitized_state.stats}")
        logger.info("")
        logger.info("  ELEMENTS (what the LLM sees):")
        for el in request.sanitized_state.elements:
            value_str = f" value=\"{el.value}\"" if el.value else ""
            status_str = f" status=\"{el.status}\"" if el.status else ""
            logger.info(f"    {el.id:12s} role={el.role:10s} label=\"{el.label}\" sensitivity={el.sensitivity} treatment={el.treatment}{value_str}{status_str}")
        logger.info("=".ljust(60))

        response = await process_step(request)
        return response
    except httpx.TimeoutException as e:
        logger.error(f"Agent step failed (LLM timeout): {e}")
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM timed out — the model is probably still loading or the page state "
                "was too large. Try again in a moment (subsequent calls are faster once "
                "the model is warm)."
            ),
        )
    except Exception as e:
        logger.error(f"Agent step failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent step failed: {str(e)}")


# ─── Session Management ────────────────────────────────────

@router.post("/sessions", response_model=SessionCreateResponse)
async def create_session(request: SessionCreateRequest):
    """Create a new agent session."""
    session_mgr = get_session_manager()
    session = session_mgr.create_session(request.task)
    return SessionCreateResponse(
        session_id=session.session_id,
        task=session.task,
        created_at=session.created_at,
    )


@router.get("/sessions", response_model=list[SessionStatusResponse])
async def list_sessions():
    """List all active sessions."""
    session_mgr = get_session_manager()
    sessions = session_mgr.list_sessions()
    return [
        SessionStatusResponse(
            session_id=s["session_id"],
            task=s["task"],
            step=s["current_step"],
            done=s["done"],
            history_length=s["history_length"],
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=SessionStatusResponse)
async def get_session(session_id: str):
    """Get session status."""
    session_mgr = get_session_manager()
    session = session_mgr.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionStatusResponse(
        session_id=session.session_id,
        task=session.task,
        step=session.current_step,
        done=session.done,
        history_length=len(session.history),
    )


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    session_mgr = get_session_manager()
    if not session_mgr.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "session_id": session_id}
