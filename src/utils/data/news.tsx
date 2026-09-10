export type NewsCategory = 'Release' | 'Network' | 'Incident'

export interface NewsLink {
    /**
     * Defaults to the href's hostname. Set it only when that reads wrongly.
     * Must stay unique across the whole feed, not just within one post: this
     * is the link's accessible name, and `e2e/routes.spec.ts` locates links
     * by it. A duplicate makes the link list ambiguous to both screen readers
     * and `getByRole('link', { name })`.
     */
    label?: string
    href: string
}

export interface NewsPost {
    /** Stable slug. React key today; the anchor a permalink route would use. */
    id: string
    /** ISO yyyy-mm-dd. */
    date: string
    category: NewsCategory
    title: string
    body: string
    /** Imported SVG. Omitted for posts that do not warrant art. */
    thumbnail?: string
    links?: NewsLink[]
}

// A link with no label shows its own hostname: unique per host,
// self-describing out of context, and showing the real URL is part of the
// point when the link leaves the site.
//
// Total by construction. `URL` throws on anything it cannot parse and this
// runs during render, where a throw unmounts the whole route — so the
// fallback is the raw string. It stays out of `Formatter` deliberately:
// every member there falls back to NO_VALUE, and a link labelled `—` is
// worse than one showing a raw href.
export const hostOf = (href: string): string => {
    try {
        return new URL(href).hostname
    } catch {
        return href
    }
}

// Dated announcements: things StakeCore shipped, and things that happened on
// the networks it runs. The feed sorts by date, so order here only matters as
// the tiebreak between posts that share a date — `Array#sort` is stable, so
// two same-dated posts keep this array's relative order in the rendered feed.
export const newsData: NewsPost[] = [
    {
        id: 'fasset-visualiser',
        date: '2026-05-11',
        category: 'Release',
        title: 'FAsset 3D Visualiser',
        body: "A live 3D view of Flare's FAsset protocol. Each agent backing FXRP is drawn as a tunnel whose width is its total backing capacity, split between minted backing and free capacity and coloured by the agent's status, with every mint and redeem travelling through it as it happens. Every figure in the scene is rendered live from protocol state, not from a snapshot. A second deployment runs the same view against the Coston2 test network.",
        links: [
            { href: 'https://fasset.stakecore.org' },
            { href: 'https://fasset-coston2.stakecore.org' },
        ],
    },
]

// Newest first, sorted here rather than trusting the array's order: a
// backdated post appended to the end would otherwise land at the top of the
// feed, and a feed in the wrong order fails silently. ISO yyyy-mm-dd compares
// correctly as a plain string, so there is no date parsing here and nothing
// that can throw.
export const sortedPosts = (posts: NewsPost[] = newsData): NewsPost[] =>
    [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
