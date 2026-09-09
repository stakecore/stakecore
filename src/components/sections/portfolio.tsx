import { useState } from 'react'
import { Link } from 'react-router'
import { RiArrowRightUpLine } from '@remixicon/react'
import { protocolsData } from '../../utils/data/protocols'
import PageHeader from '~/components/ui/pageHeader'
import './portfolio.scss'

const Portfolio = () => {
    const [category, setCategory] = useState('All')

    const filteredCategory = ['All']
    protocolsData.forEach(({ category }) => {
        if (!filteredCategory.includes(category)) filteredCategory.push(category)
    })

    const filteredProjects = category === 'All'
        ? protocolsData
        : protocolsData.filter(p => p.category === category)

    return (
        <section className="protocols">
            <div className="container">
                <PageHeader variant="section" title="Protocols">
                    Validator and protocol-signing services on Flare, Avalanche, and
                    the Songbird canary network. Each protocol specifies its own rules
                    and reward structure.
                </PageHeader>

                <ul className="protocols-filter">
                    {filteredCategory.map((item) => (
                        <li key={item}>
                            <button
                                type="button"
                                onClick={() => setCategory(item)}
                                className={item === category ? 'active' : ''}
                            >
                                {item}
                            </button>
                        </li>
                    ))}
                </ul>

                <div className="protocols-grid">
                    {filteredProjects.map(({ id, category, title, href, Thumbnail }) => (
                        <Link key={id} to={href} className="protocols-tile">
                            <div className="protocols-tile-image">
                                <Thumbnail />
                            </div>
                            <div className="protocols-tile-content">
                                <span className="protocols-tile-category">{category}</span>
                                <h3 className="protocols-tile-title">
                                    <span>{title}</span>
                                    <RiArrowRightUpLine size={16} className="protocols-tile-arrow" />
                                </h3>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default Portfolio
