"""The statement that lets Android open this site's links in the ClawPlay app.

Android fetches ``/.well-known/assetlinks.json`` from the website's host when the app is
installed; if it names the app's package and the fingerprint of the key it was signed with, the
app's links (app/app.config.ts) open in the app without asking.
"""

from fastapi import APIRouter

from baghchal_server.deps import State

ANDROID_PACKAGE = "com.clawplay.app"
router = APIRouter(include_in_schema=False)


@router.get("/.well-known/assetlinks.json")
async def asset_links(state: State) -> list[dict[str, object]]:
    """No fingerprints set (``BAGHCHAL_ANDROID_CERT_SHA256``): no statement, links stay in the
    browser."""
    fingerprints = list(state.settings.android_cert_sha256)
    if not fingerprints:
        return []
    return [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": ANDROID_PACKAGE,
                "sha256_cert_fingerprints": fingerprints,
            },
        }
    ]
