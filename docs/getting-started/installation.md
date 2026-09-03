# Installation

## Clone the repository

```bash
git clone <AEGIS_REPOSITORY_URL>
cd <AEGIS_REPOSITORY_DIRECTORY>
```

The final public repository URL can be substituted after publication.

## Install extension dependencies

```bash
npm install
```

The root package contains the TypeScript and bundling dependencies for the extension and its local perception runtime.

## Create a Python environment

=== "Linux / macOS"

    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r server/requirements.txt
    ```

=== "Windows PowerShell"

    ```powershell
    py -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r server\requirements.txt
    ```

## Optional: install documentation tooling

```bash
pip install -r requirements-docs.txt
mkdocs serve
```

This starts a local documentation preview at `http://127.0.0.1:8000`.

## Repository layout

```text
extension/          browser extension source
server/             reasoning server
server/agent/       planning, orchestration and session state
demo/               local demo webpage
docs/               documentation source
scripts/            build utilities
```

Next: [Run the extension](running-extension.md).
