# Action protocol

Aegis actions are structured data. The reasoning layer does **not** need to send executable JavaScript.

## Base shape

```json
{
  "action": "click",
  "target": "button_4",
  "params": {}
}
```

## Supported actions

| Action | Target required | Common parameters |
|---|---|---|
| `click` | yes | — |
| `type` | yes | `text` |
| `scroll` | no | `direction`, `amount` |
| `select` | yes | `value` |
| `hover` | yes | — |
| `navigate` | no | `url` |
| `wait` | no | `duration`, `selector`, `state`, `timeout` |
| `press_key` | no | `key`, `modifiers` |

## Examples

=== "Click"

    ```json
    { "action": "click", "target": "button_4" }
    ```

=== "Type"

    ```json
    {
      "action": "type",
      "target": "input_0",
      "params": { "text": "<EMAIL_1>" }
    }
    ```

=== "Scroll"

    ```json
    {
      "action": "scroll",
      "params": { "direction": "down", "amount": 500 }
    }
    ```

=== "Navigate"

    ```json
    {
      "action": "navigate",
      "params": { "url": "https://example.com" }
    }
    ```

## Why a narrow protocol

A small action vocabulary is easier to validate, log, benchmark and apply local policy to than arbitrary scripts.

See [Action schema](../reference/action-schema.md) for the complete contract.
