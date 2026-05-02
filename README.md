[![oct-daemon banner](./banner.png)](https://octd.skxv.dev)

Headless host daemon for Open Collaboration Tools.

It creates an OCT room, prints the generated room code, and exposes a local workspace folder so normal VS Code/OpenVSCode clients with the Open Collaboration Tools extension can join.

## Install

```bash
pnpm install
pnpm build
```

## Run

Host a local folder as an OCT room:

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

## Sync a Joined Room

Join an existing OCT room and keep a real local folder synchronized:

```bash
npx @skxv/oct-daemon sync --room <room-code> --workspace /path/to/local-mirror
```

With a custom OCT server:

```bash
npx @skxv/oct-daemon sync --room <room-code> --workspace /path/to/local-mirror --server https://your-oct-server.example/
```

The sync command downloads the remote workspace into the local mirror, watches it continuously, and pushes local file creates, edits, and deletes back to the room host. Incoming changes from collaborators are written back to the same local folder.

## Options

Host options:

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

Sync options:

```text
sync --room <code>          Room code to join
sync --workspace <path>     Local folder to synchronize
sync --server <url>         OCT server URL, defaults to https://api.open-collab.tools/
sync --auth-token <token>   Reusable OCT login token
sync --auth-token-file <path>
sync --exclude <glob>       Repeatable exclude glob
```

Default excludes: `**/.env`, `.git/**`, `node_modules/**`, `.opencollabtools-daemon/**`, `.opencollabtools-sync/**`.

The upstream OCT server generates room IDs. A caller-chosen `--code random-code` is not supported in v1.
