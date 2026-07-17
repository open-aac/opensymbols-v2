import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Repository, SymbolResult } from './types'

export function PageState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean
  error?: Error
  onRetry: () => void
  children: ReactNode
}) {
  if (loading) return <p className="state-message" role="status">Loading…</p>

  if (error) {
    return (
      <div className="state-message state-message--error" role="alert">
        <p>Loading failed. The OpenSymbols service may be unavailable.</p>
        <button className="button" onClick={onRetry}>Try again</button>
      </div>
    )
  }

  return children
}

export function SymbolCard({ symbol, compact = false }: { symbol: SymbolResult; compact?: boolean }) {
  return (
    <article className={`symbol-card${compact ? ' symbol-card--compact' : ''}`}>
      <Link className="symbol-card__image" to={`/symbols/${symbol.repo_key}/${symbol.symbol_key}`}>
        <img src={symbol.image_url} alt="" loading="lazy" />
      </Link>
      <Link className="symbol-card__name" to={`/symbols/${symbol.repo_key}/${symbol.symbol_key}`}>
        {symbol.name}
      </Link>
      <span className="symbol-card__meta">{symbol.repo_key}, {symbol.license || 'licence unknown'}</span>
    </article>
  )
}

export function RepositoryCard({ repository }: { repository: Repository }) {
  return (
    <Link className="repository-card" to={`/repositories/${repository.repo_key}`}>
      <img
        src={repository.logo_url}
        alt=""
        onError={(event) => { event.currentTarget.src = '/open-symbols-mark.svg' }}
      />
      <strong>{repository.name}</strong>
      <span>{repository.attribution.license || 'mixed licences'}</span>
      <span>{repository.symbol_count.toLocaleString()} symbols</span>
    </Link>
  )
}
