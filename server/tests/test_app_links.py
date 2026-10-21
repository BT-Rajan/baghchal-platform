"""``/.well-known/assetlinks.json``: which signed apps may open this site's links."""

import httpx
import pytest
from pydantic import ValidationError

from baghchal_server.config import Settings

DEBUG_KEY = (
    "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:"
    "9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"
)


async def test_no_fingerprints_no_statement(app_client: httpx.AsyncClient) -> None:
    r = await app_client.get("/.well-known/assetlinks.json")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/json"
    assert r.json() == []


class TestWithAKey:
    @pytest.fixture
    def settings(self, settings: Settings) -> Settings:
        return settings.model_copy(update={"android_cert_sha256": (DEBUG_KEY,)})

    async def test_names_the_app_and_its_key(self, app_client: httpx.AsyncClient) -> None:
        r = await app_client.get("/.well-known/assetlinks.json")
        assert r.json() == [
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": "com.clawplay.app",
                    "sha256_cert_fingerprints": [DEBUG_KEY],
                },
            }
        ]


def test_fingerprints_are_checked_and_upper_cased() -> None:
    settings = Settings(android_cert_sha256=(f" {DEBUG_KEY.lower()} ",))
    assert settings.android_cert_sha256 == (DEBUG_KEY,)
    with pytest.raises(ValidationError, match="android_cert_sha256"):
        Settings(android_cert_sha256=("FA:C6:17",))
