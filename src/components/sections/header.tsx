import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { RiGithubLine, RiSendPlaneLine, RiTwitterXLine } from '@remixicon/react'
import { menuList } from '../../utils/data/menu'
import { useGlobalStore } from '~/features/wallet/store'
import { Formatter } from '../../utils/misc/formatter'
import './header.scss'
import ThemeToggle from '~/features/theme/toggle'


const ChooseWalletButton = () => {
    const walletProvider = useGlobalStore(state => state.walletProvider)
    const walletAddress = useGlobalStore(state => state.walletAddress)
    const setWalletChoiceVisible = useGlobalStore(state => state.setWalletChoiceVisible)

    return <button type="button" onClick={() => setWalletChoiceVisible(true)} className="theme-btn connect-wallet-button">
        {walletProvider && <img src={walletProvider.info.icon} alt={walletProvider.info.name} />}
        {walletAddress ? Formatter.address(walletAddress) : "Connect Wallet"}
    </button>
}

const Header = () => {
    const pathName = useLocation().pathname
    const [isSticky, setisSticky] = useState(false)
    const [openDropdown, setOpenDropdown] = useState<number | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)

    // On route change, dismiss the mobile drawer and any open submenu.
    // react-hooks/set-state-in-effect prefers derived state, but neither
    // value can be derived: both also change on user clicks. This is a
    // legitimate route-driven reset.
    useEffect(() => {
        setDrawerOpen(false) // eslint-disable-line react-hooks/set-state-in-effect
        setOpenDropdown(null)
    }, [pathName])

    useEffect(() => {
        if (openDropdown == null) return
        const onClickOutside = (e) => {
            if (!e.target.closest('.has-submenu')) setOpenDropdown(null)
        }
        const onEscape = (e) => {
            if (e.key === 'Escape') setOpenDropdown(null)
        }
        document.addEventListener('click', onClickOutside)
        document.addEventListener('keydown', onEscape)
        return () => {
            document.removeEventListener('click', onClickOutside)
            document.removeEventListener('keydown', onEscape)
        }
    }, [openDropdown])

    const stickyHeader = () => {
        const scrollTop = window.scrollY
        if (scrollTop > 85) {
            setisSticky(true)
        }
        else {
            setisSticky(false)
        }
    }

    useEffect(() => {
        window.addEventListener("scroll", stickyHeader)
        return () => window.removeEventListener("scroll", stickyHeader)
    }, [])

    return (
        <header className={`main-header ${isSticky ? "fixed-header" : ""}`}>
            <div className="header-upper">
                <div className="container-fluid">
                    <div className="header-inner d-flex align-items-center">
                        <div className="logo-outer">
                            <div className="logo">
                                <Link to="/" aria-label="StakeCore home">
                                    <span className="logo-wordmark">stakecore</span>
                                </Link>
                            </div>
                        </div>
                        <div className="nav-outer clearfix mx-auto">
                            <nav className="main-menu navbar-expand-lg">
                                <div className="navbar-header">
                                    <div className="mobile-logo">
                                        <Link to="/" aria-label="StakeCore home">
                                            <span className="logo-wordmark">stakecore</span>
                                        </Link>
                                    </div>
                                    <ul className="mobile-social">
                                        <li><Link target="_blank" rel="noopener noreferrer" to="https://x.com/stake_core" aria-label="X"><RiTwitterXLine size={18} /></Link></li>
                                        <li><Link target="_blank" rel="noopener noreferrer" to="https://t.me/+xZoChBQyyCo3OGY0" aria-label="Telegram"><RiSendPlaneLine size={18} /></Link></li>
                                        <li><Link target="_blank" rel="noopener noreferrer" to="https://github.com/stakecore" aria-label="GitHub"><RiGithubLine size={18} /></Link></li>
                                        <li><ThemeToggle size={18} /></li>
                                    </ul>
                                    <button
                                        type="button"
                                        className="navbar-toggle"
                                        aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
                                        aria-expanded={drawerOpen}
                                        aria-controls="primary-nav"
                                        onClick={() => setDrawerOpen(open => !open)}
                                    >
                                        <span className="icon-bar"></span>
                                        <span className="icon-bar"></span>
                                        <span className="icon-bar"></span>
                                    </button>
                                </div>
                                <div id="primary-nav" className={`navbar-collapse collapse${drawerOpen ? ' show' : ''}`}>
                                    <ul className="navigation onepage clearfix">
                                        {menuList.map((item) => (
                                            item.children ? (
                                                <li key={item.id} className={`has-submenu${openDropdown === item.id ? ' open' : ''}`}>
                                                    <button
                                                        type="button"
                                                        className={`nav-link-click submenu-toggle${item.children.some(c => c.path === pathName) ? ' active' : ''}`}
                                                        // No aria-haspopup: it is shorthand for "menu", and this
                                                        // controls a plain <ul> of links, not a menu widget with
                                                        // arrow navigation. Claiming it also left axe unable to
                                                        // resolve aria-controls, filing an aria-valid-attr-value
                                                        // "incomplete" on every route. aria-expanded +
                                                        // aria-controls is the whole disclosure contract.
                                                        aria-expanded={openDropdown === item.id}
                                                        aria-controls={`submenu-${item.id}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setOpenDropdown(openDropdown === item.id ? null : item.id)
                                                        }}
                                                    >
                                                        {item.label}
                                                        <span aria-hidden="true" className="submenu-caret" />
                                                    </button>
                                                    <ul id={`submenu-${item.id}`} className="submenu-list">
                                                        {item.children.map((child) => (
                                                            <li key={child.id}>
                                                                <NavLink to={child.path} onClick={() => setOpenDropdown(null)} className={({ isActive }) => `nav-link-click${isActive ? ' active' : ''}`}>
                                                                    {child.label}
                                                                </NavLink>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </li>
                                            ) : (
                                                <li key={item.id}>
                                                    <NavLink to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-link-click${isActive ? ' active' : ''}`}>
                                                        {item.label}
                                                    </NavLink>
                                                </li>
                                            )
                                        ))}
                                    </ul>
                                </div>
                            </nav>
                        </div>
                        <div className="menu-btns">
                            <ul className="header-social">
                                <li><Link target="_blank" rel="noopener noreferrer" to="https://x.com/stake_core" aria-label="X"><RiTwitterXLine size={16} /></Link></li>
                                <li><Link target="_blank" rel="noopener noreferrer" to="https://t.me/+xZoChBQyyCo3OGY0" aria-label="Telegram"><RiSendPlaneLine size={16} /></Link></li>
                                <li><Link target="_blank" rel="noopener noreferrer" to="https://github.com/stakecore" aria-label="GitHub"><RiGithubLine size={16} /></Link></li>
                            </ul>
                            <ThemeToggle />
                            <ChooseWalletButton />
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}

export default Header