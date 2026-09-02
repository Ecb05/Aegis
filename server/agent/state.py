"""Hermes Agent — Session State

Manages session state including conversation history for multi-step tasks.
Each session tracks the full history of actions and results.
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from server.models.schemas import AgentStepRequest, Action, ActionResult


@dataclass
class SessionEntry:
    """One step in the conversation history."""
    step: int
    action: dict
    result: Optional[dict] = None
    reasoning: str = ""
    timestamp: int = 0

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = int(time.time() * 1000)


@dataclass
class Session:
    """A single agent session (one task)."""
    session_id: str
    task: str
    created_at: int
    current_step: int = 0
    done: bool = False
    history: list[SessionEntry] = field(default_factory=list)
    last_request: Optional[AgentStepRequest] = None

    def add_action(self, action: Action, reasoning: str) -> SessionEntry:
        """Record an action that was planned."""
        entry = SessionEntry(
            step=self.current_step,
            action=action.model_dump(),
            reasoning=reasoning,
        )
        self.history.append(entry)
        return entry

    def add_result(self, step: int, result: ActionResult) -> None:
        """Record the result of executing an action."""
        for entry in self.history:
            if entry.step == step:
                entry.result = {
                    "success": result.success,
                    "action": result.action,
                    "target": result.target,
                    "error": result.error,
                }
                break

    def get_history_for_llm(self) -> list[dict]:
        """Get conversation history formatted for the LLM."""
        return [
            {
                "step": entry.step,
                "action": entry.action,
                "success": entry.result.get("success", True) if entry.result else True,
                "error": entry.result.get("error") if entry.result else None,
            }
            for entry in self.history
        ]

    def mark_done(self, message: Optional[str] = None):
        """Mark the session as complete."""
        self.done = True

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "task": self.task,
            "created_at": self.created_at,
            "current_step": self.current_step,
            "done": self.done,
            "history_length": len(self.history),
        }


class SessionManager:
    """Manages all active sessions."""

    def __init__(self):
        self._sessions: dict[str, Session] = {}

    def create_session(self, task: str) -> Session:
        """Create a new session for a task."""
        session_id = str(uuid.uuid4())[:8]
        session = Session(
            session_id=session_id,
            task=task,
            created_at=int(time.time() * 1000),
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID."""
        return self._sessions.get(session_id)

    def get_or_create_session(
        self, session_id: Optional[str], task: str
    ) -> Session:
        """Get existing session or create a new one."""
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]
        return self.create_session(task)

    def list_sessions(self) -> list[dict]:
        """List all active sessions."""
        return [s.to_dict() for s in self._sessions.values()]

    def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False


# Singleton
_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    global _manager
    if _manager is None:
        _manager = SessionManager()
    return _manager
