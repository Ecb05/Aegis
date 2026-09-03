# Contributing

Aegis is moving quickly, so documentation and implementation should change together.

## Development workflow

1. Create a focused branch.
2. Make the code change.
3. Update the relevant documentation page in the same branch.
4. Run checks locally.
5. Open a pull request with a short test note.

## Local checks

```bash
npm run typecheck
npm run build
```

For documentation:

```bash
pip install -r requirements-docs.txt
mkdocs build --strict
```

## Documentation rules

- Use **Aegis** for the product name.
- Prefer short pages focused on one concept.
- Use code examples that match actual schemas.
- Mark measurements with the build/commit used.
- Do not publish secrets, test credentials or raw PII in screenshots.
- Replace benchmark `TODO` values only with measured data.
- When an implementation changes, update the architecture/reference page in the same PR.

## Pull-request checklist

```text
[ ] TypeScript/Python changes tested
[ ] No credentials or .env secrets committed
[ ] API/schema changes documented
[ ] Privacy impact considered
[ ] Benchmark impact considered
[ ] MkDocs build passes
```
