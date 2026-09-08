import { Outlet, useLocation, useMatches, useNavigation } from 'react-router'
import { useGlobalStore } from '~/features/wallet/store'
import { applyThemeToDocument, useThemeStore } from '~/features/theme/store'
import { useShallow } from 'zustand/react/shallow'
import { onInternalChainSwitch } from '~/features/wallet/hook'
import { chainFromRoute, chainToChainId } from '../utils/misc/translations'
import Header from '../components/sections/header'
import Footer from '../components/sections/footer'
import CallToAction from '../components/sections/callToAction'
import { PreloaderContent } from '../components/ui/preloader'
import { useAfterIdle } from '../utils/useAfterIdle'
import { Suspense, useEffect, useRef, useState } from 'react'
import { lazyRetry } from '~/components/ui/lazyRetry'
import { CookiesProvider } from 'react-cookie'
import { CHAIN_CONFIG } from '~/config/chains'


// Deferred chrome. None of it is visible until the user acts — toasts fire on
// wallet/contact actions, the tooltip on hover, the picker on "Connect
// Wallet" — but importing it eagerly put react-toastify, react-tooltip and
// the EIP-6963 picker (~79 kB of the eager bundle) in front of first paint on
// a page whose LCP already waits on script execution. Mounted at idle
// instead, so the chunks are warm well before anyone can click.
//
// lazyRetry with silent:true, and one boundary each. These mount inside
// RootLayout, so the only boundary above them was the *root* errorElement —
// which replaces RootLayout itself. A 503 on the react-toastify chunk
// therefore blanked the entire site, chrome included, on every route. None of
// the three has a visible surface until the user acts, so failing quietly is
// the whole recovery: the page keeps working, minus a toast.
const Toasts = lazyRetry(() => import('react-toastify').then(m => ({ default: m.ToastContainer })), { silent: true })
const Tooltips = lazyRetry(() => import('react-tooltip').then(m => ({ default: m.Tooltip })), { silent: true })
const DiscoverWalletProviders = lazyRetry(() => import('../features/wallet/picker'), { silent: true })


const NavigationPreloader = () => {
  const navigation = useNavigation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (navigation.state !== 'loading') {
      setShow(false)
      return
    }
    const t = setTimeout(() => setShow(true), 150)
    return () => clearTimeout(t)
  }, [navigation.state])

  if (!show) return null
  return <div className="preloader"><PreloaderContent /></div>
}

const RootLayout = () => {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const deferredChrome = useAfterIdle()
  const matches = useMatches()
  const hideCallToAction = matches.some(m => (m.handle as { hideCallToAction?: boolean } | undefined)?.hideCallToAction)
  // /contact only: drops CallToAction's "talk to us" prop, which would
  // otherwise link to the page the visitor is already on. The staking half of
  // the panel stays.
  const hideContactPrompt = matches.some(m => (m.handle as { hideContactPrompt?: boolean } | undefined)?.hideContactPrompt)
  // Deepest match wins, so a nested route could override its parent later.
  const routeTitle = matches.reduce<string | undefined>(
    (acc, m) => (m.handle as { title?: string } | undefined)?.title ?? acc,
    undefined,
  )
  const chain = chainFromRoute(pathname)
  const chainId = chainToChainId(chain)
  // Per-chain background art + modifier class (e.g. the Songbird symbol
  // needs a bigger render size to match Flare/Avalanche visually).
  const cfg = chain != null ? CHAIN_CONFIG[chain] : null
  const image = cfg?.background.image ?? ''
  const bgClass = cfg?.background.className ?? ''

  const { setChain, setWallet, wallet } = useGlobalStore(
    useShallow(state => ({ setChain: state.setChain, setWallet: state.setWalletAddress, wallet: state.walletProvider }))
  )
  const theme = useThemeStore(state => state.theme)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // WCAG 2.4.2. Guarded rather than unconditional: a route that forgot its
  // handle should keep index.html's title, not blank the tab.
  useEffect(() => {
    if (routeTitle) document.title = routeTitle
  }, [routeTitle])

  // The pre-paint script in index.html normally does this before React exists,
  // and the store stamps every later change synchronously. This is the repair
  // path for the case where that script did not run at all (a CSP, an
  // extension): without it the document and the store would disagree, and the
  // first toggle click would appear to do nothing.
  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  useEffect(() => {
    setChain(chainId)
    if (wallet == null) return
    // Guard against overlapping switches (rapid route changes each fire one):
    // if a newer switch supersedes this one, drop the stale result instead of
    // letting the last-to-resolve win.
    let active = true
    ;(async () => {
      const address = await onInternalChainSwitch(chainId, wallet)
      if (!active) return
      // When the switch is rejected or no account is available, clear the
      // provider alongside the address — otherwise the header shows the
      // wallet icon next to "Connect Wallet", a half-connected state.
      setWallet(address, address == null ? null : wallet)
    })()
    return () => { active = false }
    // setChain / setWallet are stable Zustand setters; intentionally
    // omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, chainId])

  return (
    <>
      <NavigationPreloader />
      {/* WCAG 2.4.1. A <main> landmark already satisfies the criterion for
          anyone browsing by landmark, but a keyboard-only sighted user has no
          landmark list — they tab, and the header is ~10 stops deep on every
          route. A <button> rather than an <a href="#main">: this is a hash
          router, so that href is a navigation to the "/main" route, not a
          fragment jump. */}
      <button
        type="button"
        className="skip-link"
        onClick={() => mainRef.current?.focus()}
      >
        Skip to main content
      </button>
      <Header />
      <div className='background'>
        {image && <div className={`background-image ${bgClass}`} style={{ backgroundImage: `url("${image}")` }} />}
        <CookiesProvider>
          {/* The page needs exactly one <main> landmark for screen-reader
              "skip to content" navigation (axe: landmark-one-main). The
              footer stays outside it — it's not main content. */}
          {/* tabIndex={-1} so the skip link can move focus *onto* it. Without
              that, focus stays in the header and the next Tab lands back on
              the nav — a scroll that looks like a skip but isn't one. -1 keeps
              it out of the tab order for everyone else. */}
          <main ref={mainRef} tabIndex={-1}>
            <Outlet />
            {!hideCallToAction && <CallToAction hideContactPrompt={hideContactPrompt} />}
          </main>
          <Footer />
        </CookiesProvider>
      </div>
      {deferredChrome && (
        <Suspense fallback={null}>
          <Toasts theme={theme} position='top-left' />
          <Tooltips id="tooltip" variant={theme} />
          <DiscoverWalletProviders />
        </Suspense>
      )}
    </>
  )
}

export default RootLayout