# CLAUDE.md

Claude Code auto-loads this file at the start of every session. This repo's
agent guide is **[AGENTS.md](./AGENTS.md)** — imported below so its rules load
automatically instead of relying on the agent to go find them.

Pay special attention to the **PR workflow** it points to
([CONTRIBUTING.md](./CONTRIBUTING.md)): every PR bumps `package.json`, the PR
title leads with that version (`vX.Y.Z: …`), and **auto-merge goes on** right
after the PR opens. Open a PR only once the owner says to: merging promotes to
production as soon as CI is green.

@AGENTS.md
