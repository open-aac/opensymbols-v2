import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  checkSession,
  generateAccessToken,
  getRepositories,
  getRepository,
  getRepositorySymbols,
  getSymbol,
  randomSymbols,
  requestSharedSecret,
  searchPublicApi,
  searchSymbols,
  submitSymbolRequest,
} from './api'
import type { InteractiveApiResult } from './api'
import { PageState, RepositoryCard, SymbolCard } from './components'
import { useAsync } from './hooks'
import type { SymbolResult } from './types'

function useSession() {
  const [userName, setUserName] = useState<string>()

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    checkSession(token)
      .then((session) => {
        if (!session.valid) throw new Error('Invalid session')
        const refreshedToken = session.refresh_token || token
        setUserName(session.user_name || 'User')
        localStorage.setItem('auth_token', refreshedToken)
        document.cookie = `auth=${refreshedToken};path=/;SameSite=Lax`
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
        document.cookie = 'auth=;path=/;max-age=0;SameSite=Lax'
      })
  }, [])

  return {
    userName,
    logout() {
      localStorage.removeItem('auth_token')
      document.cookie = 'auth=;path=/;max-age=0;SameSite=Lax'
      window.location.assign('/')
    },
  }
}

function Layout() {
  const session = useSession()

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="identity" to="/">
          <img src="/open-symbols-mark.svg" alt="" />
          <strong>Open Symbols</strong>
        </Link>
        <span className="tagline">open-licensed communication symbols for everyone</span>
        {session.userName && (
          <div className="session-links">
            <a href="/admin">{session.userName}</a>
            <span aria-hidden="true"> | </span>
            <button onClick={session.logout}>Logout</button>
          </div>
        )}
        <a className="openaac-badge" href="https://www.openaac.org" aria-label="OpenAAC">
          <span>OpenAAC</span>
        </a>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<HomePage />} />
          <Route path="/api" element={<ApiDocumentationPage />} />
          <Route path="/repositories/:repoKey" element={<RepositoryPage />} />
          <Route path="/symbols/:repoKey/:symbolKey" element={<SymbolPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer>
        OpenSymbols is <a href="https://github.com/open-aac/opensymbols">open source</a>, powered by{' '}
        <a href="https://www.openaac.org">OpenAAC</a> | <a href="/login">Admin</a>
      </footer>
    </div>
  )
}

function SearchBox({ query }: { query: string }) {
  const navigate = useNavigate()
  const [value, setValue] = useState(query)

  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        const nextQuery = value.trim()
        if (nextQuery) navigate(`/search?q=${encodeURIComponent(nextQuery)}`)
      }}
    >
      <label htmlFor="query"><strong>Search:</strong></label>
      <div>
        <input id="query" value={value} onChange={(event) => setValue(event.target.value)} />
        <button className="button button--primary" type="submit">Search</button>
        <button className="button" type="button" onClick={() => { setValue(''); navigate('/') }}>Clear</button>
      </div>
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
    <section className="request-symbol">
      <p className="request-actions">
        Can’t find the right symbol?{' '}
        <button className="link-button" onClick={() => setOpen(true)}>Suggest a Symbol</button>
        {' '}or try{' '}
        <a target="_blank" rel="noreferrer" href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}&tbs=sur:fc`}>Google</a>
        {' '}or{' '}
        <a target="_blank" rel="noreferrer" href={`https://www.flickr.com/search/?l=cc&ct=0&mt=all&adv=1&q=${encodeURIComponent(query)}`}>Flickr</a>
      </p>
      {status && <p role="status">{status}</p>}
      {open && (
        <form className="stacked-form" onSubmit={submit}>
          <h2>Request a Different Symbol</h2>
          <p>Tell us which symbol you would like to see. Requests help symbol donors know where to start.</p>
          <label>
            Symbol label
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            First letter of the symbol label
            <input required maxLength={1} value={firstLetter} onChange={(event) => setFirstLetter(event.target.value)} />
            <small>For example, “b” for “bacon”. This helps prevent automated requests.</small>
          </label>
          <label>
            Description
            <textarea required rows={4} value={comments} onChange={(event) => setComments(event.target.value)} />
          </label>
          <div>
            <button className="button button--primary">Request Symbol</button>
            <button className="button" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}

function HomePage() {
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

  return (
    <div className={query ? 'home home--searching' : 'home'}>
      <section className="home-primary">
        <SearchBox key={query} query={query} />
        {query ? (
          <>
            <PageState loading={results.loading} error={results.error} onRetry={results.retry}>
              <div className="symbol-grid">
                {results.data?.map((symbol) => <SymbolCard key={symbol.id} symbol={symbol} />)}
              </div>
              {!results.loading && results.data?.length === 0 && <p className="state-message">No results found.</p>}
            </PageState>
            <SymbolRequest key={query} query={query} />
          </>
        ) : (
          <PageState loading={repositories.loading} error={repositories.error} onRetry={repositories.retry}>
            <div className="intro-copy">
              <p>
                OpenSymbols is a collection of <a href="https://creativecommons.org/">open-licensed</a> picture
                symbols that can be used for augmentative communication. The collection pulls from multiple sources
                and currently includes access to more than {total.toLocaleString()} symbols and icons!
              </p>
              <p>Use the search box to search for communication symbols from:</p>
            </div>
            {sortedRepositories.length ? (
              <div className="repository-grid">
                {sortedRepositories.map((repository) => (
                  <RepositoryCard key={repository.repo_key} repository={repository} />
                ))}
              </div>
            ) : (
              <div className="empty-setup">
                <strong>No symbol repositories are configured in this local database.</strong>
                <p>Run <code>pnpm legacy:seed</code> to add local demonstration symbols.</p>
              </div>
            )}
            <div className="about-copy">
              <p>
                OpenSymbols exists as part of the <a href="https://www.openaac.org">OpenAAC Initiative</a> to lower
                the barriers for AAC adoption and make it easier to create AAC resources without proprietary libraries.
              </p>
              <p>Interested in using OpenSymbols in your project? See the <Link to="/api">documented Open API</Link>.</p>
            </div>
          </PageState>
        )}
      </section>
      {!query && (
        <aside className="examples">
          <div className="section-title">
            <h2>Examples:</h2>
            <button className="link-button" onClick={examples.retry}>see more</button>
          </div>
          <PageState loading={examples.loading} error={examples.error} onRetry={examples.retry}>
            <div className="example-grid">
              {examples.data?.map((symbol) => <SymbolCard key={symbol.id} symbol={symbol} compact />)}
            </div>
          </PageState>
        </aside>
      )}
    </div>
  )
}

type RepositoryFilter = 'none' | 'unsafe' | 'skins'

function RepositoryPage() {
  const { repoKey = '' } = useParams()
  const repository = useAsync(() => getRepository(repoKey), [repoKey])
  const [filter, setFilter] = useState<RepositoryFilter>('none')
  const [skin, setSkin] = useState('default')
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [pages, setPages] = useState<SymbolResult[][]>([])
  const [nextPage, setNextPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const symbols = pages.flat()

  function applySkin(symbol: SymbolResult) {
    if (skin === 'default' || !symbol.skins) return symbol
    return {
      ...symbol,
      image_url: symbol.image_url.replace(/varianted-skin\.(\w+)$/, `variant-${skin}.$1`),
    }
  }

  const load = useCallback(async (reset = true, page = 0, query = activeSearch) => {
    setLoading(true)
    setError(undefined)

    try {
      const data = query.trim()
        ? { symbols: await searchSymbols(`${query.trim()} repo:${repoKey}`, 'en', filter !== 'unsafe') }
        : await getRepositorySymbols(repoKey, {
          page,
          unsafe: filter === 'unsafe',
          hasSkin: filter === 'skins',
        })
      setPages((current) => reset ? [data.symbols] : [...current, data.symbols])
      setNextPage(page + 1)
      setHasMore(Boolean('meta' in data && data.meta?.next_url))
    } catch (caught) {
      setError(caught as Error)
    } finally {
      setLoading(false)
    }
  }, [activeSearch, filter, repoKey])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- route/filter changes begin a new request lifecycle. */
    void load(true, 0)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load])

  return (
    <section className="content-page">
      <PageState loading={repository.loading} error={repository.error} onRetry={repository.retry}>
        {repository.data && (
          <div className="repository-summary">
            <img
              src={repository.data.logo_url}
              alt=""
              onError={(event) => { event.currentTarget.src = '/open-symbols-mark.svg' }}
            />
            <div>
              <h1>{repository.data.name}</h1>
              <dl>
                <dt>Website</dt>
                <dd>{repository.data.url ? <a href={repository.data.url}>{repository.data.url}</a> : 'Not supplied'}</dd>
                <dt>Default Licence</dt>
                <dd>
                  {repository.data.attribution.license || 'mixed licences'}{' '}
                  {repository.data.attribution.license_url && <a href={repository.data.attribution.license_url}>more info</a>}
                </dd>
                <dt>Primary Author</dt><dd>{repository.data.attribution.author_name || 'unknown'}</dd>
                <dt>Symbols Shared</dt><dd>{repository.data.symbol_count.toLocaleString()}</dd>
                <dt>Description</dt><dd>{repository.data.description || 'No description supplied.'}</dd>
              </dl>
            </div>
          </div>
        )}
      </PageState>
      <form
        className="repository-controls"
        onSubmit={(event) => {
          event.preventDefault()
          setActiveSearch(search.trim())
        }}
      >
        <label>
          Skin Tone
          <select value={skin} onChange={(event) => setSkin(event.target.value)}>
            <option value="default">Default</option>
            <option value="light">Light</option>
            <option value="medium-light">Medium-Light</option>
            <option value="medium">Medium</option>
            <option value="medium-dark">Medium-Dark</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Filter
          <select value={filter} onChange={(event) => setFilter(event.target.value as RepositoryFilter)}>
            <option value="none">No Filter</option>
            <option value="unsafe">Unsafe Results</option>
            <option value="skins">Skinned Results</option>
          </select>
        </label>
        <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div>
          <button className="button">Go</button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setSearch('')
              setActiveSearch('')
            }}
          >
            Show All
          </button>
        </div>
      </form>
      <PageState loading={loading} error={error} onRetry={() => void load(true, 0)}>
        <div className="symbol-grid">
          {symbols.map((symbol) => <SymbolCard key={symbol.id} symbol={applySkin(symbol)} />)}
        </div>
        {!loading && symbols.length === 0 && <p className="state-message">No results found.</p>}
      </PageState>
      {!activeSearch && hasMore && (
        <button className="button button--primary more" onClick={() => void load(false, nextPage)}>
          More Symbols
        </button>
      )}
    </section>
  )
}

function SymbolPage() {
  const { repoKey = '', symbolKey = '' } = useParams()
  const symbol = useAsync(() => getSymbol(repoKey, symbolKey), [repoKey, symbolKey])

  return (
    <section className="content-page">
      <PageState loading={symbol.loading} error={symbol.error} onRetry={symbol.retry}>
        {symbol.data && (
          <div className="symbol-detail">
            <div>
              <h1>{symbol.data.name}</h1>
              <img src={symbol.data.image_url} alt={symbol.data.name} />
            </div>
            <dl>
              <dt>Actions</dt>
              <dd><a className="button" href={`/admin/symbols/${repoKey}/${symbolKey}`}>Edit Symbol</a></dd>
              <dt>URL</dt>
              <dd>{symbol.data.source_url ? <a href={symbol.data.source_url}>{symbol.data.source_url}</a> : 'Source not available'}</dd>
              <dt>Type</dt><dd>{symbol.data.extension || 'unknown'}</dd>
              <dt>Licence</dt>
              <dd>{symbol.data.license_url ? <a href={symbol.data.license_url}>{symbol.data.license}</a> : symbol.data.license}</dd>
              <dt>Author</dt>
              <dd>{symbol.data.author_url ? <a href={symbol.data.author_url}>{symbol.data.author}</a> : symbol.data.author || 'unknown'}</dd>
              <dt>Repository</dt><dd><Link to={`/repositories/${repoKey}`}>{repoKey}</Link></dd>
              {symbol.data.description && <><dt>Description</dt><dd>{symbol.data.description}</dd></>}
            </dl>
          </div>
        )}
      </PageState>
    </section>
  )
}

function ApiResult({ result }: { result?: InteractiveApiResult }) {
  if (!result) return null

  return (
    <div className={`api-result${result.ok ? '' : ' api-result--error'}`}>
      <h3>Results</h3>
      <pre aria-live="polite">{result.output}</pre>
    </div>
  )
}

function ApiDocumentationPage() {
  const [secret, setSecret] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [query, setQuery] = useState('')
  const [locale, setLocale] = useState('en')
  const [safe, setSafe] = useState(true)
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState('')
  const [tokenResult, setTokenResult] = useState<InteractiveApiResult>()
  const [searchResult, setSearchResult] = useState<InteractiveApiResult>()
  const [sharedSecretResult, setSharedSecretResult] = useState<InteractiveApiResult>()
  const [tokenLoading, setTokenLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [sharedSecretLoading, setSharedSecretLoading] = useState(false)

  async function requestToken(event: FormEvent) {
    event.preventDefault()
    setTokenLoading(true)

    try {
      const result = await generateAccessToken(secret)
      setTokenResult(result)
      if (result.ok && result.data?.access_token) {
        setAccessToken(result.data.access_token)
        setSecret('')
      }
    } catch {
      setTokenResult({ status: 0, ok: false, output: 'Request failed before the server responded.' })
    } finally {
      setTokenLoading(false)
    }
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault()
    setSearchLoading(true)

    try {
      setSearchResult(await searchPublicApi({ accessToken, query, locale, safe }))
    } catch {
      setSearchResult({ status: 0, ok: false, output: 'Request failed before the server responded.' })
    } finally {
      setSearchLoading(false)
    }
  }

  async function applyForSharedSecret(event: FormEvent) {
    event.preventDefault()
    setSharedSecretLoading(true)

    try {
      const result = await requestSharedSecret({ organization, email, purpose })
      setSharedSecretResult(result)
      if (result.ok && result.data?.shared_secret) {
        setOrganization('')
        setEmail('')
        setPurpose('')
      }
    } catch {
      setSharedSecretResult({ status: 0, ok: false, output: 'Request failed before the server responded.' })
    } finally {
      setSharedSecretLoading(false)
    }
  }

  return (
    <article className="content-page api-documentation">
      <header className="api-introduction">
        <p className="eyebrow">Developer documentation</p>
        <h1>OpenSymbols API Documentation</h1>
        <p>
          OpenSymbols is an open-licensed repository of picture symbols. Applications can use the API to search
          across participating symbol libraries and add picture search to their own tools.
        </p>
        <p>
          Public API access requires a shared secret. <a href="#shared-secret">Apply below</a> if you need one.
          Exchange that secret for a short-lived access token, then send the token in the <code>Authorization</code>
          header or as the <code>access_token</code> query parameter on later requests. The header is preferred because
          URLs can be logged. Keep shared secrets on a trusted server; do not expose them in browser JavaScript or
          compiled application code.
        </p>
      </header>

      <section className="api-call">
        <div className="api-reference">
          <h2>POST <code>/api/v2/token</code></h2>
          <p>Generate a short-lived access token from the shared secret provided to your application.</p>
          <h3>Form parameters</h3>
          <dl>
            <dt><code>secret</code></dt>
            <dd>Required shared secret. It must remain private.</dd>
          </dl>
          <h3>Successful response</h3>
          <pre>{`HTTP 200
{
  "access_token": "token::…",
  "expires": "2026-07-18T12:00:00Z"
}`}</pre>
        </div>
        <form className="api-runner" onSubmit={requestToken}>
          <h2>Generate an access token</h2>
          <p>The value is sent only to this OpenSymbols server and is not stored by the site.</p>
          <label>
            Shared secret
            <input
              required
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
          <button className="button button--primary" disabled={tokenLoading}>
            {tokenLoading ? 'Sending…' : 'Submit'}
          </button>
          <ApiResult result={tokenResult} />
        </form>
      </section>

      <section className="api-call">
        <div className="api-reference">
          <h2>GET <code>/api/v2/symbols</code></h2>
          <p>Search for public symbols. Send the access token in the <code>Authorization</code> header.</p>
          <h3>Query parameters</h3>
          <dl>
            <dt><code>q</code></dt>
            <dd>
              Required search terms. Add <code>repo:repo-key</code> to limit results, <code>favor:repo-key</code> to
              favour a library, or <code>hc:1</code> to favour high-contrast results.
            </dd>
            <dt><code>locale</code></dt>
            <dd>Two-letter lowercase locale such as <code>en</code> or <code>es</code>. Defaults to <code>en</code>.</dd>
            <dt><code>safe</code></dt>
            <dd>Safe search is enabled by default. Send <code>0</code> to include unsafe results.</dd>
          </dl>
          <h3>Successful response</h3>
          <pre>{`HTTP 200
[
  {
    "id": 2211,
    "symbol_key": "castle-1-2fcbe1a4",
    "name": "gato",
    "locale": "es",
    "license": "CC BY-NC-SA",
    "license_url": "http://creativecommons.org/licenses/by-nc-sa/3.0/",
    "author": "Sergio Palao",
    "author_url": "http://www.catedu.es/arasaac/condiciones_uso.php",
    "source_url": null,
    "repo_key": "arasaac",
    "hc": false,
    "extension": "png",
    "image_url": "https://…",
    "search_string": null,
    "unsafe_result": false,
    "_href": "/api/v1/symbols/arasaac/castle-1-2fcbe1a4?id=2211",
    "details_url": "/symbols/arasaac/castle-1-2fcbe1a4?id=2211"
  }
]`}</pre>
          <p>
            Other attributes may appear but should not be treated as stable. Image dimensions and file size are not
            returned, so HTML clients should use <code>object-fit</code> and <code>object-position</code> to centre images.
          </p>
        </div>
        <form className="api-runner" onSubmit={runSearch}>
          <h2>Try symbol search</h2>
          <label>
            Access token
            <input required value={accessToken} onChange={(event) => setAccessToken(event.target.value)} />
          </label>
          <label>
            Search terms
            <input required value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label>
            Locale
            <input required maxLength={2} value={locale} onChange={(event) => setLocale(event.target.value)} />
          </label>
          <label>
            Safe search
            <select value={safe ? '1' : '0'} onChange={(event) => setSafe(event.target.value === '1')}>
              <option value="1">Enabled</option>
              <option value="0">Disabled</option>
            </select>
          </label>
          <button className="button button--primary" disabled={searchLoading}>
            {searchLoading ? 'Searching…' : 'Submit'}
          </button>
          <ApiResult result={searchResult} />
        </form>
      </section>

      <section className="api-secret-request" id="shared-secret">
        <div>
          <h2>Request a Shared Secret</h2>
          <p><code>POST /api/v2/generate_secret</code></p>
          <p>
            Submit one application for each app or distinct purpose. Shared secrets may be disabled if their usage
            affects other OpenSymbols users, so identify a monitored email address and describe the intended use.
          </p>
          <p>
            By applying, you agree to use the service responsibly and avoid unnecessary repeated image requests.
          </p>
        </div>
        <form className="api-runner" onSubmit={applyForSharedSecret}>
          <h2>Shared secret application</h2>
          <label>
            Organization
            <input required value={organization} onChange={(event) => setOrganization(event.target.value)} />
          </label>
          <label>
            Email
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Purpose
            <textarea
              required
              rows={4}
              placeholder="Description of your intended use"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </label>
          <button className="button button--primary" disabled={sharedSecretLoading}>
            {sharedSecretLoading ? 'Sending…' : 'Submit application'}
          </button>
          <ApiResult result={sharedSecretResult} />
        </form>
      </section>

      <section className="api-notes">
        <h2>Handling errors and image URLs</h2>
        <p>
          An expired token returns <code>HTTP 401</code> with <code>token_expired: true</code>; request a new token and
          retry. Excessive request rates return <code>HTTP 429</code> with <code>throttled: true</code>.
        </p>
        <p>
          OpenSymbols currently returns long-lived image URLs. Download images you need to retain rather than creating
          unnecessary repeated traffic, and use <code>object-fit</code> and <code>object-position</code> when displaying
          images with unknown dimensions.
        </p>
      </section>
    </article>
  )
}

function NotFoundPage() {
  return (
    <section className="content-page not-found">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>This part of Open Symbols has not been rebuilt here yet.</p>
      <p><Link to="/">Return to Open Symbols</Link></p>
    </section>
  )
}

export function App() {
  return <Layout />
}
