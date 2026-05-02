export const siteConfig = {
  name: "oct-daemon",
  title: "oct-daemon | Headless OCT workspace host and sync daemon",
  description:
    "Host a local folder as an Open Collaboration Tools room or sync an OCT room into a real workspace directory for collaborative coding and agentic editing.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://octd.skxv.dev",
  image: "/meta-banner.png",
  imageWidth: 710,
  imageHeight: 388,
  author: "SKXV",
  creatorUrl: "https://skxv.dev",
  githubUrl: "https://github.com/DDDASHXD/oct-daemon",
  keywords: [
    "oct-daemon",
    "Open Collaboration Tools",
    "OCT daemon",
    "collaborative coding",
    "workspace sync",
    "headless daemon",
    "agentic editing",
    "VS Code collaboration",
    "OpenVSCode collaboration",
    "CLI workspace sharing",
  ],
} as const

export function absoluteUrl(path = "/") {
  return new URL(path, siteConfig.url).toString()
}
