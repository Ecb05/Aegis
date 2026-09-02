"""Hermes Server — Action Tool Schemas

Defines the 8 action types the LLM can produce, with validation rules.
These match the extension's action-executor.ts exactly.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal, Union


# ─── Individual Action Schemas ──────────────────────────────

class ClickAction(BaseModel):
    """Click on an element."""
    action: Literal["click"] = "click"
    target: str = Field(..., description="Hermes element ID (e.g., 'button_0')")
    params: Optional[dict] = None


class TypeAction(BaseModel):
    """Type text into an input field."""
    action: Literal["type"] = "type"
    target: str = Field(..., description="Hermes element ID (e.g., 'input_0')")
    params: dict = Field(
        ...,
        description="Must include 'text' key with the text to type",
        examples=[{"text": "Hello world"}],
    )


class ScrollAction(BaseModel):
    """Scroll the page."""
    action: Literal["scroll"] = "scroll"
    target: Optional[str] = None
    params: dict = Field(
        ...,
        description="Must include 'direction' (up/down) and optionally 'amount' (pixels)",
        examples=[{"direction": "down", "amount": 500}],
    )


class SelectAction(BaseModel):
    """Select an option from a dropdown."""
    action: Literal["select"] = "select"
    target: str = Field(..., description="Hermes element ID (e.g., 'select_0')")
    params: dict = Field(
        ...,
        description="Must include 'value' key with the option value to select",
        examples=[{"value": "morning"}],
    )


class HoverAction(BaseModel):
    """Hover over an element."""
    action: Literal["hover"] = "hover"
    target: str = Field(..., description="Hermes element ID")
    params: Optional[dict] = None


class NavigateAction(BaseModel):
    """Navigate to a URL."""
    action: Literal["navigate"] = "navigate"
    target: Optional[str] = None
    params: dict = Field(
        ...,
        description="Must include 'url' key",
        examples=[{"url": "https://example.com"}],
    )


class WaitAction(BaseModel):
    """Wait for a condition or duration."""
    action: Literal["wait"] = "wait"
    target: Optional[str] = None
    params: dict = Field(
        ...,
        description="Either 'duration' (ms) or 'selector' + 'state' (hidden/visible)",
        examples=[{"duration": 2000}],
    )


class PressKeyAction(BaseModel):
    """Press a keyboard key."""
    action: Literal["press_key"] = "press_key"
    target: Optional[str] = None
    params: dict = Field(
        ...,
        description="Must include 'key' (e.g., 'Enter', 'Tab', 'Escape')",
        examples=[{"key": "Enter"}],
    )


# ─── Union Type ─────────────────────────────────────────────

HermesAction = Union[
    ClickAction,
    TypeAction,
    ScrollAction,
    SelectAction,
    HoverAction,
    NavigateAction,
    WaitAction,
    PressKeyAction,
]

ACTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "click": ClickAction,
    "type": TypeAction,
    "scroll": ScrollAction,
    "select": SelectAction,
    "hover": HoverAction,
    "navigate": NavigateAction,
    "wait": WaitAction,
    "press_key": PressKeyAction,
}

# Risk levels for each action type
ACTION_RISK: dict[str, str] = {
    "click": "low",
    "type": "medium",
    "scroll": "low",
    "select": "medium",
    "hover": "low",
    "navigate": "medium",
    "wait": "low",
    "press_key": "low",
}

# Action descriptions for the LLM prompt
ACTION_DESCRIPTIONS: dict[str, str] = {
    "click": "Click on an element. Requires target (element ID).",
    "type": "Type text into an input field. Requires target + params.text.",
    "scroll": "Scroll the page. Requires params.direction ('up'/'down') + optional params.amount.",
    "select": "Select a dropdown option. Requires target + params.value.",
    "hover": "Hover over an element. Requires target.",
    "navigate": "Navigate to a URL. Requires params.url.",
    "wait": "Wait for condition. Use params.duration (ms) or params.selector + params.state ('hidden'/'visible').",
    "press_key": "Press a keyboard key. Requires params.key (e.g., 'Enter', 'Tab', 'Escape').",
}


def validate_action(action: dict) -> tuple[bool, str]:
    """Validate an action dict against schemas. Returns (valid, error_message)."""
    action_type = action.get("action")
    if not action_type:
        return False, "Missing 'action' field"

    if action_type not in ACTION_SCHEMAS:
        return False, f"Unknown action type: {action_type}. Valid: {list(ACTION_SCHEMAS.keys())}"

    schema = ACTION_SCHEMAS[action_type]
    try:
        schema.model_validate(action)
        return True, ""
    except Exception as e:
        return False, f"Validation error for '{action_type}': {e}"
