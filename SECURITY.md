# Security policy

## Supported versions

Until the package reaches 1.0, only the latest published version receives
security fixes.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature on the
`mikecfisher/railway-alchemy-provider` repository.

If private reporting is unavailable, open a public issue containing only a
request for a private contact channel. Do not include vulnerability details,
credentials, private Railway identifiers, variable values, Alchemy state, or
private API responses in that issue.

Reports should include:

- the affected package version;
- the impact and affected lifecycle;
- the smallest safe reproduction description;
- whether credentials, state, or Railway resources may have been exposed.

You should receive an acknowledgement within seven days. Release timing depends
on impact, reproducibility, and coordination requirements.

## Credential exposure

If a real Railway or npm credential was committed, logged, or shared publicly,
revoke and replace it immediately. Removing it from the latest commit is not
sufficient because repository and registry history may retain it.
