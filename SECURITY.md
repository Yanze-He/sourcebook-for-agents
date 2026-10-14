# Security Policy

Sourcebook local services listen only on `127.0.0.1`. Do not expose the local API through a reverse proxy, LAN binding, tunnel, or public host.

Report security issues through GitHub's private vulnerability reporting form: **Security → Advisories → Report a vulnerability**. Do not file public issues for credential exposure, localhost access bypasses, arbitrary file access, unsafe archive extraction, or data-loss vulnerabilities.

Never commit local SQLite databases, exported Packs, browser storage dumps, source page content, signing certificates, notarization credentials, or store publishing keys.
