const THESVG_BASE_URL = 'https://thesvg.org'

export interface TheSvgSearchResult {
  slug: string
  title: string
  category?: string
  variants?: string[]
}

interface TheSvgSearchResponse {
  icons?: Array<{
    slug: string
    title: string
    category?: string
    variants?: string[]
  }>
}

export async function searchLogos(query: string, limit = 10): Promise<TheSvgSearchResult[]> {
  const url = new URL('/api/icons', THESVG_BASE_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`theSVG search failed: ${response.status}`)
  }

  const data = await response.json() as TheSvgSearchResponse
  return (data.icons ?? []).map((icon) => ({
    slug: icon.slug,
    title: icon.title,
    category: icon.category,
    variants: icon.variants,
  }))
}

export async function fetchLogoSvg(slug: string, variant = 'default'): Promise<string> {
  const url = `${THESVG_BASE_URL}/icons/${slug}/${variant}.svg`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`theSVG icon fetch failed for ${slug}/${variant}: ${response.status}`)
  }

  return response.text()
}
