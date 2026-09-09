import './protocolThumbnails.scss'


// The four protocol tile illustrations on the home page.
//
// These were four .svg files loaded through <img src>, which put their colours
// beyond CSS's reach — so they stayed dark cards on a light page. Inline SVG
// lets the theme tokens in protocolThumbnails.scss paint them, and one source
// serves both palettes; a second set of light .svg files would have been a
// second copy of the same geometry to keep in step.
//
// Inlining also exposed what the files hid: there are only TWO drawings here.
// The two FSP tiles share a ring and the same 24 ticks, the two validator
// tiles share a ring, a star polyline and the same 10 nodes. Each pair
// differed only in its brand mark, so that is the only thing the four exports
// at the bottom actually vary.

// Tick lengths clockwise from 12 o'clock, one per 15°. Irregular on purpose —
// it reads as a signal rather than a clock face.
const TICK_LENGTHS = [
    112, 107, 114, 118, 110, 105, 109, 115,
    119, 113, 106, 104, 107, 112, 117, 114,
    108, 111, 115, 118, 110, 106, 109, 113,
]

// A ten-pointed star drawn as one stroke, plus the vertices it passes through.
const STAR_PATH = '240,40 344.6,184 175.3,239 175.3,61 344.6,116 240,260 135.4,116 304.7,61 304.7,239 135.4,184 240,40'
const STAR_NODES: [number, number][] = [
    [240, 40], [304.7, 61], [344.6, 116], [344.6, 184], [304.7, 239],
    [240, 260], [175.3, 239], [135.4, 184], [135.4, 116], [175.3, 61],
]

// aria-hidden because the tile's own heading already names the protocol —
// these carry no information the link does not. That matches the alt="" the
// <img> versions carried. focusable="false" keeps them out of the tab order.
const Frame = ({ children }: { children: React.ReactNode }) => (
    <svg
        className="protocol-thumb"
        viewBox="0 0 480 300"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
    >
        <rect className="protocol-thumb-bg" width="480" height="300" />
        {children}
    </svg>
)

const FspField = () => (
    <>
        <circle className="protocol-thumb-ring" cx="240" cy="150" r="92" />
        <g className="protocol-thumb-ticks" transform="translate(240,150)">
            {TICK_LENGTHS.map((length, i) => (
                <line key={length + i * 360} x1="0" y1="-96" x2="0" y2={-length} transform={`rotate(${i * 15})`} />
            ))}
        </g>
    </>
)

const ValidatorField = () => (
    <>
        <circle className="protocol-thumb-ring-faint" cx="240" cy="150" r="110" />
        <polyline className="protocol-thumb-web" points={STAR_PATH} />
        <g className="protocol-thumb-nodes">
            {STAR_NODES.map(([cx, cy]) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="4" />)}
        </g>
    </>
)

// Brand marks keep their own hex rather than a token: they are the networks'
// colours, not ours, and each is saturated enough to hold on either ground.
const FlareMark = ({ transform }: { transform: string }) => (
    <g transform={transform} fill="#E62058">
        <path d="M27.3,13.7H9.2c-5,0-9,3.9-9.2,8.9c0,0.1,0.1,0.2,0.2,0.2h18.1c5,0,9-3.9,9.2-8.9C27.5,13.8,27.4,13.7,27.3,13.7L27.3,13.7L27.3,13.7z" />
        <path d="M36.4,0H9.2c-5,0-9,3.9-9.2,8.9C0,9,0.1,9.2,0.2,9.2h27.3c5,0,9-3.9,9.2-8.9C36.7,0.1,36.6,0,36.4,0L36.4,0L36.4,0z" />
        <circle cx="4.6" cy="32" r="4.6" />
    </g>
)

export const FlareFspThumbnail = () => (
    <Frame>
        <FspField />
        <FlareMark transform="translate(205,115) scale(1.9)" />
    </Frame>
)

export const FlareValidatorThumbnail = () => (
    <Frame>
        <ValidatorField />
        <FlareMark transform="translate(205,115) scale(1.9)" />
    </Frame>
)

export const SongbirdFspThumbnail = () => (
    <Frame>
        <FspField />
        <g transform="translate(170,80) scale(3.5)" fill="#6B8AAA">
            <path d="m12.7 7.1 2.2 6.6 2.3 7.1 4.8-6.1-9.3-7.7z" />
            <path d="m16.6 27.8 8.6-5.3-7.9-1z" />
            <path d="m16.7 22.3-1.5 2.7-4.4 8 4.9-1.5.3-3z" />
            <path d="m28.3 16.1-1 2.8 1.9 1.7z" />
            <path d="m17.5 21.1 8 1-3.3-7z" />
            <path d="m24 17.7 1.8 4.1 2.2-6.1z" />
        </g>
    </Frame>
)

export const AvalancheValidatorThumbnail = () => (
    <Frame>
        <ValidatorField />
        <g transform="translate(195,105) scale(0.703)" fill="#FF394A">
            <path d="M45 104.68H20a5.3 5.3 0 0 1-4.62-7.9l44.08-78.19a5.3 5.3 0 0 1 9.23 0L81.9 41.91a5.3 5.3 0 0 1 0 5.31l-32.31 54.85a5.29 5.29 0 0 1-4.59 2.61zm28.48-7.92 14.85-26.49a5.31 5.31 0 0 1 9.24 0l15 26.48a5.31 5.31 0 0 1-4.61 7.93H78.11a5.31 5.31 0 0 1-4.63-7.92z" />
        </g>
    </Frame>
)
