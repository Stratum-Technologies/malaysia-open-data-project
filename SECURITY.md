# Security

Report vulnerabilities privately to the project maintainers rather than through a public issue when disclosure could enable abuse.

Catalogue content is untrusted input, and every consumer of this repository has to treat it that way: render escaped text only, reject dangerous URL schemes, and never inject catalogue strings as HTML.

Report a bad entry the same way you would report a vulnerability. A URL that resolves into a private network, a host that has been taken over and now serves something else, or a licence claim that misrepresents terms a publisher never agreed to — all of those belong in a private report, not a public issue.

Do not use the directory to publish credentials, personal secrets, unlawfully obtained datasets, bypass instructions, or direct access to exposed private systems.

## Automated checks

`scripts/check-links.ts` makes requests to third-party hosts on behalf of a contributor's pull request, so it refuses loopback, private, link-local, metadata and otherwise non-public addresses before each request, and re-checks the resolved address after every redirect rather than trusting the first answer.

Workflows in this repository hold no secrets and request `contents: read` only. Nothing in a pull request is executed with credentials in scope. If you find a way to make either claim false, that is the vulnerability to report.
