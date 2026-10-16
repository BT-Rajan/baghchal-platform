# Security

Please report vulnerabilities privately to the maintainers rather than in a public issue.

Engineering rules for this codebase:
- The server is authoritative. Never trust a client for game state, legality, timing or results.
- Validate every input against a schema at the boundary; parsers are strict and bounded in size.
- No secrets in the repository. Configuration comes from the environment; the server refuses to
  start without required secrets rather than falling back to defaults.
- Passwords are hashed with argon2id. Tokens are random, single-use, short-lived and never
  returned in API responses.
- Dependencies are locked (`uv.lock`) and CI runs with `--locked`.
