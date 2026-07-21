import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getRepositories, randomSymbols, searchSymbols, submitSymbolRequest } from '../api'
import { RepositoryCard, SymbolCard } from '../components'
import {
  Button,
  ButtonAnchor,
  ButtonLink,
  EmptyState,
  FormActions,
  PageContainer,
  PageState,
  ResponsiveGrid,
  SectionHeading,
  StatusMessage,
  Surface,
  TextAreaField,
  TextField,
} from '../components/ui'
import { useAsync } from '../hooks'
import './discovery.css'

function SearchForm({ query }: { query: string }) {
  const navigate = useNavigate()
  const [value, setValue] = useState(query)

  function submit(event: FormEvent) {
    event.preventDefault()
    const nextQuery = value.trim()
    if (nextQuery) navigate(`/search?q=${encodeURIComponent(nextQuery)}`)
  }

  return (
    <form className="discovery-search" role="search" onSubmit={submit}>
      <TextField
        id="symbol-search"
        label="Search symbols"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Try hello, food, school…"
      />
      <FormActions className="discovery-search__actions">
        <Button variant="primary" type="submit">Search</Button>
        {query && <Button type="button" onClick={() => { setValue(''); navigate('/') }}>Clear search</Button>}
      </FormActions>
    </form>
  )
}

function SymbolRequest({ query }: { query: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(query)
  const [firstLetter, setFirstLetter] = useState('')
  const [comments, setComments] = useState('')
  const [status, setStatus] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setStatus('Requesting symbol…')
    try {
      await submitSymbolRequest({ name, first_letter: firstLetter, comments })
      setStatus('Symbol request submitted. Thank you!')
      setOpen(false)
    } catch {
      setStatus('Request failed. Check the fields and try again.')
    }
  }

  return (
    <section className="request-symbol" aria-labelledby="request-symbol-heading">
      <h2 id="request-symbol-heading">Still looking?</h2>
      <p>Suggest a symbol for the collection, or search open-licensed images elsewhere.</p>
      <div className="request-actions">
        <Button variant="secondary" onClick={() => setOpen(true)}>Suggest a symbol</Button>
        <ButtonAnchor variant="quiet" target="_blank" rel="noreferrer" href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}&tbs=sur:fc`}>Search Google Images</ButtonAnchor>
        <ButtonAnchor variant="quiet" target="_blank" rel="noreferrer" href={`https://www.flickr.com/search/?l=cc&ct=0&mt=all&adv=1&q=${encodeURIComponent(query)}`}>Search Flickr</ButtonAnchor>
      </div>
      {status && <StatusMessage className="request-status" status="status">{status}</StatusMessage>}
      {open && (
        <Surface className="stacked-form-surface">
          <form className="stacked-form" onSubmit={submit}>
            <h3>Request a different symbol</h3>
            <p>Tell us which symbol you would like to see. Requests help symbol donors know where to start.</p>
            <TextField id="request-name" label="Symbol label" required value={name} onChange={(event) => setName(event.target.value)} />
            <TextField id="request-letter" label="First letter of the symbol label" hint="For example, “b” for “bacon”. This helps prevent automated requests." required maxLength={1} value={firstLetter} onChange={(event) => setFirstLetter(event.target.value)} />
            <TextAreaField id="request-description" label="Description" required rows={4} value={comments} onChange={(event) => setComments(event.target.value)} />
            <FormActions>
              <Button variant="primary" type="submit">Request symbol</Button>
              <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            </FormActions>
          </form>
        </Surface>
      )}
    </section>
  )
}

export function DiscoveryPage() {
  const [params] = useSearchParams()
  const query = params.get('q') || ''
  const repositories = useAsync(getRepositories, [])
  const examples = useAsync(randomSymbols, [])
  const results = useAsync(() => (query ? searchSymbols(query) : Promise.resolve([])), [query])
  const sortedRepositories = useMemo(
    () => [...(repositories.data || [])].sort((a, b) => b.symbol_count - a.symbol_count),
    [repositories.data],
  )
  const total = sortedRepositories.reduce((sum, repository) => sum + repository.symbol_count, 0)

  if (query) {
    const resultCount = results.data?.length || 0
    return (
      <PageContainer className="discovery-page search-results-page">
        <header className="search-results-header">
          <p className="eyebrow">Symbol search</p>
          <h1>Results for “{query}”</h1>
          <p className="search-results-count" role="status">
            {results.loading
              ? 'Searching…'
              : results.error
                ? 'Search unavailable'
                : `${resultCount} ${resultCount === 1 ? 'symbol' : 'symbols'} found`}
          </p>
        </header>
        <SearchForm key={query} query={query} />
        <PageState loading={results.loading} error={results.error} onRetry={results.retry} loadingLabel="Searching for symbols…">
          {resultCount ? (
            <ResponsiveGrid className="symbol-grid">
              {results.data?.map((symbol) => <SymbolCard key={symbol.id} symbol={symbol} />)}
            </ResponsiveGrid>
          ) : (
            <EmptyState heading="No matching symbols" description="Try a broader word, a synonym, or make a request below." />
          )}
        </PageState>
        <SymbolRequest key={query} query={query} />
      </PageContainer>
    )
  }

  return (
    <PageContainer className="discovery-page">
      <section className="discovery-hero" aria-labelledby="discovery-heading">
        <div className="discovery-hero__copy">
          <p className="eyebrow">OpenSymbols</p>
          <h1 id="discovery-heading">Find open communication symbols</h1>
          <p>Search open-licensed picture symbols for augmentative and alternative communication.</p>
        </div>
        <SearchForm query="" />
      </section>

      <section className="discovery-section" aria-labelledby="repositories-heading">
        <SectionHeading id="repositories-heading" title="Browse symbol collections" description={`${total.toLocaleString()} symbols from open and shared libraries.`} />
        <PageState loading={repositories.loading} error={repositories.error} onRetry={repositories.retry}>
          {sortedRepositories.length ? (
            <ResponsiveGrid className="repository-grid">
              {sortedRepositories.map((repository) => <RepositoryCard key={repository.repo_key} repository={repository} />)}
            </ResponsiveGrid>
          ) : (
            <EmptyState
              heading="No symbol repositories are configured"
              description={<>Run <code>pnpm legacy:seed</code> to add local demonstration symbols.</>}
            />
          )}
        </PageState>
      </section>

      <section className="discovery-section" aria-labelledby="examples-heading">
        <SectionHeading id="examples-heading" title="Symbol examples" description="A sample from across the collection." action={<Button variant="quiet" onClick={examples.retry}>Show more examples</Button>} />
        <PageState loading={examples.loading} error={examples.error} onRetry={examples.retry}>
          <ResponsiveGrid className="example-grid">
            {examples.data?.map((symbol) => <SymbolCard key={symbol.id} symbol={symbol} compact />)}
          </ResponsiveGrid>
        </PageState>
      </section>

      <section className="discovery-about" aria-labelledby="about-heading">
        <div>
          <p className="eyebrow">Built for access</p>
          <h2 id="about-heading">Open symbols, fewer barriers</h2>
          <p>OpenSymbols is part of the <a href="https://www.openaac.org">OpenAAC Initiative</a>, making it easier to create AAC resources without proprietary libraries.</p>
        </div>
        <ButtonLink variant="secondary" to="/api">Read the API documentation</ButtonLink>
      </section>
    </PageContainer>
  )
}
