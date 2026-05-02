import Link from "next/link"
import { ArrowRight02Icon, OctopusIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CopyCommandButton } from "@/components/copy-command-button"
import { ThemeSelect } from "@/components/theme-select"

const hostCommand = "pnpx @skxv/oct-daemon --workspace /path/to/workspace"

const syncCommand =
  "pnpx @skxv/oct-daemon@latest sync --room your-room-key --workspace /path/to/workspace"

function TerminalWindow({
  command,
  title,
}: {
  command: string
  title: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-terminal-border/10 bg-terminal shadow-terminal">
      <div className="flex h-10 items-center gap-2 border-b border-terminal-border/6 bg-terminal-header px-4">
        <span className="size-3 rounded-full bg-terminal-red" />
        <span className="size-3 rounded-full bg-terminal-yellow" />
        <span className="size-3 rounded-full bg-terminal-green" />
        <span className="ml-3 min-w-0 truncate text-sm text-terminal-title/78">
          {title}
        </span>
        <CopyCommandButton command={command} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.82rem] leading-6 break-words whitespace-pre-wrap text-terminal-text sm:p-5 sm:text-[0.9rem]">
        <code>{command}</code>
      </pre>
    </div>
  )
}

function ReadMoreLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-2 text-[1.02rem] font-medium text-page-link transition hover:text-page-host"
    >
      Read more
      <HugeiconsIcon
        icon={ArrowRight02Icon}
        size={18}
        strokeWidth={1.8}
        aria-hidden="true"
      />
    </Link>
  )
}

export default function Page() {
  return (
    <main className="min-h-svh bg-background px-5 pt-10 pb-16 text-foreground sm:px-8 sm:py-24">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-20">
        <section className="flex flex-col gap-9">
          <div className="w-max rounded-full bg-page-heading p-2 text-background">
            <HugeiconsIcon
              icon={OctopusIcon}
              size={30}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </div>
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-[1.38rem] leading-tight font-medium text-page-heading">
                oct-daemon
              </h1>
              <a
                href="https://skxv.dev"
                className="mt-1 block w-fit text-[1.18rem] leading-7 text-page-muted decoration-page-muted/55 underline-offset-3 hover:underline"
              >
                By SKXV
              </a>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href="https://github.com/DDDASHXD/oct-daemon"
                className="rounded-full bg-pill px-5 py-2 text-sm font-medium text-pill-foreground transition hover:bg-pill-hover"
              >
                View on GitHub
              </a>
              <ThemeSelect />
            </div>
          </div>

          <div className="space-y-6 text-[1.06rem] leading-8 text-page-body sm:text-[1.12rem] sm:leading-8">
            <p>
              oct-daemon is a headless host daemon for Open Collaboration Tools.
              It creates an OCT room, exposes a local workspace folder, and lets
              normal VS Code or OpenVSCode clients join through the OCT
              extension.
            </p>
            <p>
              It is built for the quiet plumbing around collaborative editing:
              share a folder when you need a room, or mirror a room into a real
              local directory when an agent needs to edit files with ordinary
              filesystem access.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-7">
          <div>
            <p className="text-sm font-medium text-page-host">Create a room</p>
            <h2 className="mt-2 text-[1.55rem] leading-tight font-medium text-page-heading">
              Host a folder
            </h2>
          </div>

          <TerminalWindow command={hostCommand} title="Host workspace" />

          <div className="space-y-6 text-[1.06rem] leading-8 text-page-body sm:text-[1.12rem] sm:leading-8">
            <p>
              This command starts oct-daemon against a folder path, creates a
              room on the OCT server, and prints the room code and join URI.
              Guests can connect to that room and read or write files through
              the protocol.
            </p>
            <p>
              Use it when a local workspace is the source of truth and you want
              to make that folder available to collaborators, tools, or remote
              coding sessions.
            </p>
            <ReadMoreLink href="/read-more#host-mode" />
          </div>
        </section>

        <section className="flex flex-col gap-7 pb-12">
          <div>
            <p className="text-sm font-medium text-page-sync">
              Sync for agents
            </p>
            <h2 className="mt-2 text-[1.55rem] leading-tight font-medium text-page-heading">
              Mirror a room into a directory
            </h2>
          </div>

          <TerminalWindow command={syncCommand} title="Sync room" />

          <div className="space-y-6 text-[1.06rem] leading-8 text-page-body sm:text-[1.12rem] sm:leading-8">
            <p>
              The sync command joins an existing OCT room, downloads the remote
              workspace into a local folder, and keeps both sides moving
              together as files are created, edited, or deleted.
            </p>
            <p>
              That makes the room usable for agentic editing: an agent can work
              in a normal local directory while the room host and collaborators
              stay connected through OCT.
            </p>
            <ReadMoreLink href="/read-more#sync-mode" />
          </div>
        </section>
      </div>
    </main>
  )
}
