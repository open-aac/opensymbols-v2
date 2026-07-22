import type { Repository, SymbolResult } from './types'
import { CardLink } from './components/ui'
export { PageState } from './components/ui'

export function SymbolCard({ symbol, compact = false }: { symbol: SymbolResult; compact?: boolean }) {
  return (
    <article className={`symbol-card${compact ? ' symbol-card--compact' : ''}`}>
      <CardLink className="symbol-card__link" to={`/symbols/${symbol.repo_key}/${symbol.symbol_key}`}>
        <img src={symbol.image_url} alt="" loading="lazy" />
        <strong className="symbol-card__name">{symbol.name}</strong>
        <span className="symbol-card__meta">{symbol.repo_key} · {symbol.license || 'licence unknown'}</span>
      </CardLink>
    </article>
  )
}

export function RepositoryCard({ repository }: { repository: Repository }) {
  return (
    <CardLink className="repository-card" to={`/repositories/${repository.repo_key}`}>
      <span className="repository-card__image-plate">
        <img
          src={repository.logo_url}
          alt=""
          onError={(event) => { event.currentTarget.src = '/open-symbols-mark.svg' }}
        />
      </span>
      <strong className="repository-card__name">{repository.name}</strong>
      <span className="repository-card__meta">{repository.attribution.license || 'mixed licences'}</span>
      <span className="repository-card__meta">{repository.symbol_count.toLocaleString()} symbols</span>
    </CardLink>
  )
}
