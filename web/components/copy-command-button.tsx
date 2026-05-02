"use client"

import { useState } from "react"
import { Copy01Icon, CopyCheckIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = command
      textarea.setAttribute("readonly", "")
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={copyCommand}
      title={copied ? "Copied" : "Copy command"}
      className="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md text-terminal-title/70 transition hover:bg-terminal-title/8 hover:text-terminal-title focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terminal-title/55"
      aria-label="Copy command"
    >
      <HugeiconsIcon
        icon={copied ? CopyCheckIcon : Copy01Icon}
        size={16}
        strokeWidth={1.8}
        aria-hidden="true"
      />
    </button>
  )
}
