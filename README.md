# opencollabtools-daemon

Headless host daemon for Open Collaboration Tools.

It creates an OCT room, prints the generated room code, and exposes a local workspace folder so normal VS Code/OpenVSCode clients with the Open Collaboration Tools extension can join.

## Install

```bash
pnpm install
pnpm build
```

## Run With PM2

```bash
pm2 start /Users/skov/Documents/GitHub/oct-daemon/dist/cli.js --name oct-daemon -- --workspace /path/to/workspace
pm2 logs oct-daemon
```

With a custom OCT server:

```bash
pm2 start /Users/skov/Documents/GitHub/oct-daemon/dist/cli.js --name oct-daemon -- --workspace /path/to/workspace --server https://your-oct-server.example/
```

The daemon prints:

```text
ROOM_ID=<generated-code>
JOIN_URI=<server-url>#<generated-code>
```

Enter the generated room code in a physical VS Code instance using the Open Collaboration Tools extension.

## Options

```text
--workspace <path>          Folder to share
--server <url>              OCT server URL, defaults to https://api.open-collab.tools/
--auth-token <token>        Reusable OCT login token
--auth-token-file <path>    Token file, defaults to <workspace>/.opencollabtools-daemon/auth-token
--readonly                  Reject write operations from guests
--exclude <glob>            Repeatable exclude glob
--name <name>               Workspace display name, defaults to folder basename
```

Default excludes: `**/.env`, `.git/**`, `node_modules/**`.

The upstream OCT server generates room IDs. A caller-chosen `--code random-code` is not supported in v1.
