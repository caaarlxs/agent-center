# Security

Agent Center runs on your Mac and can act on your Claude Code sessions, your repositories and,
with the Pipeline, your environments. A flaw in it can matter. Thank you for reporting one.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private report instead:
**Security › Report a vulnerability** on this repository.

Include what an attacker can do, the steps to reproduce it, and the version (`git rev-parse HEAD`
in your clone).

## In scope

- A web page, another app or another user on the Mac that can make the server act: send a
  message, run a command, read a file or a conversation.
- A file the board serves that runs code in the board's origin.
- A path outside what a session's transcript names that the server reads or serves.
- Secrets (the Jira token, deploy secrets) that end up in a file, a log or a response.

## Out of scope

- What a Claude Code session itself does with its own permissions.
- Anything that needs the attacker to already run code as you on your Mac.

[docs/privacy.md](docs/privacy.md) describes what the server guards and what it sends out.

## Supported versions

Only the latest commit on `main`. Update with `git pull` and **Update**.
