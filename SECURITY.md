# Security

Please report vulnerabilities privately to the maintainers rather than in a public issue.

Engineering rules for this codebase:
- The server is authoritative. Never trust a client for game state, legality, timing or results.
- Validate every input against a schema at the boundary; parsers are strict and bounded in size.
- No secrets in the repository. Configuration comes from the environment; the server refuses to
  start without required secrets rather than falling back to defaults.
- Passwords are hashed with argon2id. Session tokens are random and only their hash is stored;
  browsers get theirs in an HttpOnly cookie, apps get theirs once, in the sign-in response, and
  keep it in the device's secure storage. Emailed tokens (sign-up, password reset, email
  change) are random, single-use, short-lived and never returned in API responses.
- Changing the email address or password, and deleting the account, need the current password
  and are rate-limited per account.
- Roles are never granted through the API: moderators are made from the server's command line,
  so a stolen session cannot promote itself. Every moderator action is logged with its reason.
- Responses never reveal whether an email address is registered (sign-up, password reset and
  email changes answer the same either way).
- Operational endpoints are not public: `/metrics` needs a bearer token (and does not exist
  without one), and the production proxy serves neither `/metrics` nor `/health` to the
  internet. Error reports (Sentry) carry no personal data: no IP addresses, cookies, headers or
  request bodies.
- Dependencies are locked (`uv.lock`, `package-lock.json`); CI runs with `--locked` and checks
  deployment tools against pinned checksums.
