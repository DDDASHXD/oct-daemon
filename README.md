# @skxv/oct-daemon

Headless host daemon for Open Collaboration Tools.

It creates an OCT room, prints the generated room code, and exposes a local workspace folder so normal VS Code/OpenVSCode clients with the Open Collaboration Tools extension can join.

## Install

```bash
pnpm install
pnpm build
```

## Run

```bash
npx @skxv/oct-daemon --workspace /path/to/workspace
```

With a custom OCT server:

```bash
npx @skxv/oct-daemon --workspace /path/to/workspace --server https://your-oct-server.example/
```

Run in the background:

```bash
npx @skxv/oct-daemon --workspace /path/to/workspace --detached
```

The daemon prints:

```text
ROOM_ID=<generated-code>
JOIN_URI=<server-url>#<generated-code>
```

Detached mode prints:

```text
DETACHED_PID=<pid>
LOG_FILE=<workspace>/.opencollabtools-daemon/oct-daemon.log
```

The room details are written to the log file.

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
-d, --detached              Run in the background
--detatched                 Alias for --detached
```

Default excludes: `**/.env`, `.git/**`, `node_modules/**`.

The upstream OCT server generates room IDs. A caller-chosen `--code random-code` is not supported in v1.
