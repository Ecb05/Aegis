# Action schema reference

The server returns one action per step.

## Action

```json
{
  "action": "type",
  "target": "input_0",
  "params": {
    "text": "example"
  },
  "reasoning": "The form requires this field before submission."
}
```

## Action types

```text
click
type
scroll
select
hover
navigate
wait
press_key
```

## Parameter fields

The server schema currently supports optional parameters including:

- `text`
- `url`
- `direction`
- `amount`
- `value`
- `duration`
- `key`
- `modifiers`
- `selector`
- `state`
- `timeout`

## Action result

After local execution:

```json
{
  "success": true,
  "action": "click",
  "target": "button_4",
  "timestamp": 1780000000000
}
```

If execution fails, `error` contains a human-readable failure description.
