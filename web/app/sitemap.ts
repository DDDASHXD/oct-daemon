import type { MetadataRoute } from "next"

import { absoluteUrl } from "@/lib/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/read-more"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ]
}
