"""Print the API's OpenAPI schema; the app generates its TypeScript types from it.

uv run python -m baghchal_server.openapi > app/src/api/openapi.json
"""

import json
import sys

from baghchal_server.app import create_app
from baghchal_server.config import Settings


def schema() -> str:
    app = create_app(Settings(environment="test"))
    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    sys.stdout.write(schema())


if __name__ == "__main__":  # pragma: no cover
    main()
