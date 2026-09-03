# Browser agents

A browser agent converts a user goal into a sequence of observations and browser actions.

A minimal agent loop looks like this:

```text
observe page → decide next action → execute → observe again
```

The difficult part is not clicking a button. The difficult part is giving the reasoning system enough context to choose the correct button **without unnecessarily exposing everything visible in the browser**.

## Why raw screenshots are attractive

Screenshots provide a model with the same visual surface a human sees. They also work when a page is heavily styled, canvas-based or uses visual state that is difficult to infer from HTML alone.

But a screenshot can contain much more than the task requires: names, messages, tokens, addresses, account balances, medical data and credentials.

## Aegis approach

Aegis separates browser agency into three responsibilities:

1. **Perception** — understand the current page locally.
2. **Privacy transformation** — reduce the observation to task-relevant, safe context.
3. **Reasoning and action** — decide the next structured browser operation.

This makes the reasoning server a consumer of a purpose-built state representation rather than an unrestricted viewer of the browser.
