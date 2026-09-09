import {
    AvalancheValidatorThumbnail,
    FlareFspThumbnail,
    FlareValidatorThumbnail,
    SongbirdFspThumbnail,
} from "~/components/ui/protocolThumbnails"

// `Thumbnail` is a component, not a URL: these illustrations are drawn from
// the theme tokens so one drawing serves both palettes, which an <img src>
// could not do. See protocolThumbnails.tsx.
export const protocolsData = [
    {
        id: 1,
        category: "Flare",
        title: "Validator",
        href: '/flare/validator',
        Thumbnail: FlareValidatorThumbnail
    },
    {
        id: 2,
        category: "Flare",
        title: "FSP",
        href: '/flare/fsp',
        Thumbnail: FlareFspThumbnail
    },
    {
        id: 3,
        category: "Songbird",
        title: "FSP",
        href: "/songbird/fsp",
        Thumbnail: SongbirdFspThumbnail
    },
    {
        id: 4,
        category: "Avalanche",
        title: "Validator",
        href: '/avalanche/validator',
        Thumbnail: AvalancheValidatorThumbnail
    }
]
