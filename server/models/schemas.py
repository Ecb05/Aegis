"""Hermes Server — Pydantic Schemas

Request/response models matching the extension's TypeScript types.
These define the contract between the extension and server.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


# ─── Element Schemas ────────────────────────────────────────

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class PageInfo(BaseModel):
    title: str
    url: str
    domain: str


class SanitizedElement(BaseModel):
    id: str
    role: str  # button, textbox, select, link, form, checkbox, radio, etc.
    label: str
    value: Optional[str] = None
    original_data_type: Optional[str] = Field(None, alias="originalDataType")
    sensitivity: int = 0  # 0-4
    relevance: str = "CONDITIONAL"  # RELEVANT, CONDITIONAL, NEVER
    treatment: str = "pass"  # pass, pseudonymize, redact, omit, protective_proxy
    status: Optional[str] = None  # pre-filled, empty, user-provided
    visible: Optional[bool] = None
    bbox: Optional[BoundingBox] = None
    # Context disambiguation: the card/group this element belongs to
    # (e.g. the movie title under a duplicated "play" button). Sanitized
    # client-side — may be a pseudonym token.
    context: Optional[str] = None
    # True when (role + label) is duplicated and no context disambiguated it.
    ambiguous: Optional[bool] = None

    model_config = {"populate_by_name": True}


class SanitizedState(BaseModel):
    elements: list[SanitizedElement]
    task: str
    page_info: PageInfo = Field(..., alias="pageInfo")
    stats: dict[str, int]

    model_config = {"populate_by_name": True}


# ─── Action Schemas ─────────────────────────────────────────

class ActionParams(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None
    direction: Optional[str] = None
    amount: Optional[int] = None
    value: Optional[str] = None
    duration: Optional[int] = None
    key: Optional[str] = None
    modifiers: Optional[list[str]] = None
    selector: Optional[str] = None
    state: Optional[str] = None
    timeout: Optional[int] = None


class Action(BaseModel):
    """A single action for the extension to execute."""
    action: str  # click, type, scroll, select, hover, navigate, wait, press_key
    target: Optional[str] = None  # Hermes element ID
    params: Optional[ActionParams] = None
    reasoning: Optional[str] = None  # Why this action


class ActionResult(BaseModel):
    """Result of executing an action."""
    success: bool
    action: str
    target: Optional[str] = None
    error: Optional[str] = None
    timestamp: int = 0  # informational only — tolerate missing value
    # ─── Verification (agent confirms the task actually took effect) ───
    verified: Optional[bool] = None      # true if DOM read-back matched
    expected_value: Optional[str] = Field(None, alias="expectedValue")
    actual_value: Optional[str] = Field(None, alias="actualValue")

    model_config = {"populate_by_name": True}


# ─── Agent Step Schemas ────────────────────────────────────

class AgentStepRequest(BaseModel):
    """Request from extension: send sanitized state + task, get next action."""
    model_config = {"populate_by_name": True}

    sanitized_state: SanitizedState = Field(..., alias="sanitizedState")
    task: str
    step: int = 0  # Current step number
    last_action: Optional[ActionResult] = Field(None, alias="lastAction")
    session_id: Optional[str] = Field(None, alias="sessionId")


class AgentStepResponse(BaseModel):
    """Response to extension: the next action to execute."""
    model_config = {"populate_by_name": True}

    action: Action
    reasoning: str  # LLM's reasoning for this action
    step: int
    done: bool = False  # True if task is complete
    message: Optional[str] = None  # Status message for the user
    session_id: str = Field(..., alias="sessionId")


# ─── Session Schemas ────────────────────────────────────────

class SessionCreateRequest(BaseModel):
    task: str


class SessionCreateResponse(BaseModel):
    model_config = {"populate_by_name": True}

    session_id: str = Field(..., alias="sessionId")
    task: str
    created_at: int = Field(..., alias="createdAt")


class SessionStatusResponse(BaseModel):
    model_config = {"populate_by_name": True}

    session_id: str = Field(..., alias="sessionId")
    task: str
    step: int
    done: bool
    history_length: int = Field(..., alias="historyLength")


# ─── Health Schemas ─────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    provider: str
    model: str
    version: str
