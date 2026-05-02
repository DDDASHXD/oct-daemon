"use client"

import { useSyncExternalStore } from "react"
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

const themes = [
  { icon: Sun03Icon, label: "Light", value: "light" },
  { icon: Moon02Icon, label: "Dark", value: "dark" },
  { icon: ComputerIcon, label: "System", value: "system" },
]

function selectedThemeIcon(value: string | undefined) {
  return themes.find((theme) => theme.value === value)?.icon ?? ComputerIcon
}

function subscribeToHydration(onStoreChange: () => void) {
  const timeout = window.setTimeout(onStoreChange, 0)

  return () => {
    window.clearTimeout(timeout)
  }
}

function useIsMounted() {
  return useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  )
}

export function ThemeSelect() {
  const mounted = useIsMounted()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const value = mounted ? (theme ?? "system") : "system"
  const iconValue = mounted && value === "system" ? resolvedTheme : value

  return (
    <Select
      value={value}
      onValueChange={(nextTheme) => {
        if (nextTheme) {
          setTheme(nextTheme)
        }
      }}
    >
      <SelectTrigger
        aria-label="Theme"
        className="flex aspect-square h-full flex-col items-center justify-center rounded-full border-0 bg-pill p-0 text-pill-foreground hover:bg-pill-hover dark:bg-pill dark:hover:bg-pill-hover [&>svg:last-child]:hidden"
      >
        <HugeiconsIcon
          icon={selectedThemeIcon(iconValue)}
          size={18}
          strokeWidth={2}
          aria-hidden="true"
        />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {themes.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            onClick={() => {
              setTheme(option.value)
            }}
          >
            <HugeiconsIcon
              icon={option.icon}
              size={16}
              strokeWidth={2}
              aria-hidden="true"
            />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
