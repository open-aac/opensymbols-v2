import type { ReactNode } from 'react'
import type { Repository, SymbolResult } from './types'
import { Button, CardLink } from './components/ui'

export function PageState({
  loading,
  error,
  onRetry,
  loadingLabel = 'Loading…',
  children,
}: {
  loading: boolean
  error?: Error
  onRetry: () => void
  loadingLabel?: string
  children: ReactNode
}) {
  if (loading) return <p className="state-message" role="status">{loadingLabel}</p>

  if (error) {
    return (
      <div className="state-message state-message--error" role="alert">
        <h2>Loading failed</h2>
        <p>The OpenSymbols service may be unavailable.</p>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  return children
}

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
      <img
        src={repository.logo_url}
        alt=""
        onError={(event) => { event.currentTarget.src = '/open-symbols-mark.svg' }}
      />
      <strong>{repository.name}</strong>
      <span>{repository.attribution.license || 'mixed licences'}</span>
      <span>{repository.symbol_count.toLocaleString()} symbols</span>
    </CardLink>
  )
}
