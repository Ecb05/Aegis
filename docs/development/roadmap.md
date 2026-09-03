# Roadmap

This roadmap is intentionally organized around **capabilities and evidence**, not dates. The team can update it as the final SIH build stabilizes.

## Stabilize the core loop

- [ ] Freeze final Aegis naming across extension/server/docs
- [ ] Freeze browser-to-server schema
- [ ] Freeze action protocol
- [ ] Verify multi-step session behavior
- [ ] Verify stop/max-step behavior

## Privacy hardening

- [ ] Verify all outbound task/context paths against the final privacy policy
- [ ] Verify pseudonym lifetime and reverse mapping behavior
- [ ] Add difficult false-positive/false-negative PII cases
- [ ] Add network-payload leakage tests

## Perception optimization

- [ ] Freeze final model checkpoints
- [ ] Record cold/warm load behavior
- [ ] Tune fusion thresholds with labeled pages
- [ ] Document model footprint and client resource usage

## Evaluation

- [ ] Build visual-context benchmark
- [ ] Build PII detection benchmark
- [ ] Build treatment/redaction benchmark
- [ ] Record resource measurements
- [ ] Record p50/p95 end-to-end latency
- [ ] Add final result tables to docs

## Demo readiness

- [ ] Freeze deterministic demo task
- [ ] Capture clean screenshots/GIF/video references
- [ ] Prepare failure recovery path
- [ ] Verify GitHub Pages build on final public repo
