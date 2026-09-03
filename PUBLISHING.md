# Publishing the Aegis documentation

The repository is already configured to build the `docs/` directory with Material for MkDocs and deploy the generated site through GitHub Pages.

## One-time GitHub setup

1. Push these documentation files to the public Aegis repository on the `main` branch.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open **Actions → Deploy documentation** and run the workflow if it did not start automatically.
5. After the deploy job completes, open the deployment URL shown by GitHub Pages.

The project-page URL will normally follow:

```text
https://<github-user-or-org>.github.io/<repository>/
```

## Future updates

Any later push to `main` that changes:

```text
docs/**
mkdocs.yml
requirements-docs.txt
.github/workflows/docs.yml
```

will automatically rebuild and redeploy the documentation. The published URL stays the same.

## Preview locally

```bash
pip install -r requirements-docs.txt
mkdocs serve
```

For a strict production build:

```bash
mkdocs build --strict
```

## Before the SIH final submission

- Replace benchmark `TODO` placeholders with measured results.
- Add the final public GitHub repository URL where appropriate.
- Add screenshots/demo media after checking that they contain no real PII or credentials.
- Confirm all product naming is `Aegis`.
- Confirm the current code schemas still match the API/reference documentation.
