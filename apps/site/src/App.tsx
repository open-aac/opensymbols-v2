import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import {
  generateAccessToken,
  getRepository,
  getRepositorySymbols,
  getSymbol,
  requestSharedSecret,
  searchPublicApi,
  searchSymbols,
} from './api'
import type { InteractiveApiResult } from './api'
import { SymbolCard } from './components'
import { SiteLayout } from './components/layout'
import { usePageTitle } from './components/page-title'
import {
  Button,
  ButtonLink,
  DescriptionList,
  EmptyState,
  FormActions,
  PageSection,
  PageState,
  ResponsiveGrid,
  SelectField,
  Surface,
  TextAreaField,
  TextField,
} from './components/ui'
import { DiscoveryPage } from './features/discovery'
import {
  RequireAuthentication,
  SignInPage,
  SignUpPage,
} from './features/authentication'
import {
  AccountAreaPage,
  AccountLayout,
  AccountOverviewPage,
  AccountSettingsPage,
} from './features/account'
import { useAsync } from './hooks'
import type { SymbolResult } from './types'
import './app-pages.css'

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
  usePageTitle(repository.data?.name)

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
    <PageSection className="repository-page">
      <PageState loading={repository.loading} error={repository.error} onRetry={repository.retry}>
        {repository.data && (
          <div className="repository-summary">
            <img
              src={repository.data.logo_url}
              alt=""
              onError={(event) => { event.currentTarget.src = '/open-symbols-mark.svg' }}
            />
            <div className="repository-summary__content">
              <h1>{repository.data.name}</h1>
              <DescriptionList items={[
                { term: 'Website', description: repository.data.url ? <a href={repository.data.url}>{repository.data.url}</a> : 'Not supplied' },
                {
                  term: 'Default Licence',
                  description: <>{repository.data.attribution.license || 'mixed licences'}{' '}{repository.data.attribution.license_url && <a href={repository.data.attribution.license_url}>more info</a>}</>,
                },
                { term: 'Primary Author', description: repository.data.attribution.author_name || 'unknown' },
                { term: 'Symbols Shared', description: repository.data.symbol_count.toLocaleString() },
                { term: 'Description', description: repository.data.description || 'No description supplied.' },
              ]} />
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
        <SelectField id="repository-skin" label="Skin Tone" value={skin} onChange={(event) => setSkin(event.target.value)}>
            <option value="default">Default</option>
            <option value="light">Light</option>
            <option value="medium-light">Medium-Light</option>
            <option value="medium">Medium</option>
            <option value="medium-dark">Medium-Dark</option>
            <option value="dark">Dark</option>
        </SelectField>
        <SelectField id="repository-filter" label="Filter" value={filter} onChange={(event) => setFilter(event.target.value as RepositoryFilter)}>
            <option value="none">No Filter</option>
            <option value="unsafe">Unsafe Results</option>
            <option value="skins">Skinned Results</option>
        </SelectField>
        <TextField id="repository-search" label="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <FormActions>
          <Button type="submit">Go</Button>
          <Button
            type="button"
            onClick={() => {
              setSearch('')
              setActiveSearch('')
            }}
          >
            Show All
          </Button>
        </FormActions>
      </form>
      <PageState loading={loading} error={error} onRetry={() => void load(true, 0)}>
        <ResponsiveGrid className="symbol-grid">
          {symbols.map((symbol, index) => <SymbolCard key={`${symbol.id}-${index}`} symbol={applySkin(symbol)} />)}
        </ResponsiveGrid>
        {!loading && symbols.length === 0 && <EmptyState heading="No results found" description="Try changing the search or filters." />}
      </PageState>
      {!activeSearch && hasMore && (
        <Button className="more" variant="primary" onClick={() => void load(false, nextPage)}>
          More Symbols
        </Button>
      )}
    </PageSection>
  )
}

function SymbolPage() {
  const { repoKey = '', symbolKey = '' } = useParams()
  const symbol = useAsync(() => getSymbol(repoKey, symbolKey), [repoKey, symbolKey])
  usePageTitle(symbol.data?.name)

  return (
    <PageSection className="symbol-page">
      <PageState loading={symbol.loading} error={symbol.error} onRetry={symbol.retry}>
        {symbol.data && (
          <div className="symbol-detail">
            <div className="symbol-detail__media">
              <h1>{symbol.data.name}</h1>
              <img src={symbol.data.image_url} alt={symbol.data.name} />
            </div>
            <DescriptionList items={[
              { term: 'URL', description: symbol.data.source_url ? <a href={symbol.data.source_url}>{symbol.data.source_url}</a> : 'Source not available' },
              { term: 'Type', description: symbol.data.extension || 'unknown' },
              { term: 'Licence', description: symbol.data.license_url ? <a href={symbol.data.license_url}>{symbol.data.license}</a> : symbol.data.license },
              { term: 'Author', description: symbol.data.author_url ? <a href={symbol.data.author_url}>{symbol.data.author}</a> : symbol.data.author || 'unknown' },
              { term: 'Repository', description: <Link to={`/repositories/${repoKey}`}>{repoKey}</Link> },
              ...(symbol.data.description ? [{ term: 'Description', description: symbol.data.description }] : []),
            ]} />
          </div>
        )}
      </PageState>
    </PageSection>
  )
}

function ApiResult({ result }: { result?: InteractiveApiResult }) {
  if (!result) return null

  return (
    <Surface className="api-result" tone={result.ok ? 'muted' : 'danger'}>
      <h3>Results</h3>
      <pre aria-live="polite">{result.output}</pre>
    </Surface>
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
    <PageSection className="api-documentation">
      <header className="api-introduction">
        <p className="eyebrow">Developer documentation</p>
        <h1>Open Symbols API Documentation</h1>
        <p>
          Open Symbols is an open-licensed repository of picture symbols. Applications can use the API to search
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
          <DescriptionList items={[
            { term: <code>secret</code>, description: 'Required shared secret. It must remain private.' },
          ]} />
          <h3>Successful response</h3>
          <pre>{`HTTP 200
{
  "access_token": "token::…",
  "expires": "2026-07-18T12:00:00Z"
}`}</pre>
        </div>
        <Surface className="api-runner-surface">
          <form className="api-runner" onSubmit={requestToken}>
            <h2>Generate an access token</h2>
            <p>The value is sent only to this Open Symbols server and is not stored by the site.</p>
            <TextField
              id="api-shared-secret"
              label="Shared secret"
              required
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
            <Button variant="primary" type="submit" disabled={tokenLoading}>
              {tokenLoading ? 'Sending…' : 'Submit'}
            </Button>
            <ApiResult result={tokenResult} />
          </form>
        </Surface>
      </section>

      <section className="api-call">
        <div className="api-reference">
          <h2>GET <code>/api/v2/symbols</code></h2>
          <p>Search for public symbols. Send the access token in the <code>Authorization</code> header.</p>
          <h3>Query parameters</h3>
          <DescriptionList items={[
            {
              term: <code>q</code>,
              description: <>Required search terms. Add <code>repo:repo-key</code> to limit results, <code>favor:repo-key</code> to favour a library, or <code>hc:1</code> to favour high-contrast results.</>,
            },
            { term: <code>locale</code>, description: <>Two-letter lowercase locale such as <code>en</code> or <code>es</code>. Defaults to <code>en</code>.</> },
            { term: <code>safe</code>, description: <>Safe search is enabled by default. Send <code>0</code> to include unsafe results.</> },
          ]} />
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
        <Surface className="api-runner-surface">
          <form className="api-runner" onSubmit={runSearch}>
            <h2>Try symbol search</h2>
            <TextField id="api-access-token" label="Access token" required value={accessToken} onChange={(event) => setAccessToken(event.target.value)} />
            <TextField id="api-search-query" label="Search terms" required value={query} onChange={(event) => setQuery(event.target.value)} />
            <TextField id="api-search-locale" label="Locale" required maxLength={2} value={locale} onChange={(event) => setLocale(event.target.value)} />
            <SelectField id="api-safe-search" label="Safe search" value={safe ? '1' : '0'} onChange={(event) => setSafe(event.target.value === '1')}>
                <option value="1">Enabled</option>
                <option value="0">Disabled</option>
            </SelectField>
            <Button variant="primary" type="submit" disabled={searchLoading}>
              {searchLoading ? 'Searching…' : 'Submit'}
            </Button>
            <ApiResult result={searchResult} />
          </form>
        </Surface>
      </section>

      <section className="api-secret-request" id="shared-secret">
        <div>
          <h2>Request a Shared Secret</h2>
          <p><code>POST /api/v2/generate_secret</code></p>
          <p>
            Submit one application for each app or distinct purpose. Shared secrets may be disabled if their usage
            affects other Open Symbols users, so identify a monitored email address and describe the intended use.
          </p>
          <p>
            By applying, you agree to use the service responsibly and avoid unnecessary repeated image requests.
          </p>
        </div>
        <Surface className="api-runner-surface">
          <form className="api-runner" onSubmit={applyForSharedSecret}>
            <h2>Shared secret application</h2>
            <TextField id="api-organization" label="Organization" required value={organization} onChange={(event) => setOrganization(event.target.value)} />
            <TextField id="api-email" label="Email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextAreaField
              id="api-purpose"
              label="Purpose"
              required
              rows={4}
              placeholder="Description of your intended use"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
            />
            <Button variant="primary" type="submit" disabled={sharedSecretLoading}>
              {sharedSecretLoading ? 'Sending…' : 'Submit application'}
            </Button>
            <ApiResult result={sharedSecretResult} />
          </form>
        </Surface>
      </section>

      <section className="api-notes">
        <h2>Handling errors and image URLs</h2>
        <p>
          An expired token returns <code>HTTP 401</code> with <code>token_expired: true</code>; request a new token and
          retry. Excessive request rates return <code>HTTP 429</code> with <code>throttled: true</code>.
        </p>
        <p>
          Open Symbols currently returns long-lived image URLs. Download images you need to retain rather than creating
          unnecessary repeated traffic, and use <code>object-fit</code> and <code>object-position</code> when displaying
          images with unknown dimensions.
        </p>
      </section>
    </PageSection>
  )
}

function NotFoundPage() {
  return (
    <PageSection className="not-found">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>This part of Open Symbols has not been rebuilt here yet.</p>
      <ButtonLink to="/">Return to Open Symbols</ButtonLink>
    </PageSection>
  )
}

export function App() {
  return (
    <SiteLayout>
      <Routes>
        <Route path="/" element={<DiscoveryPage />} />
        <Route path="/search" element={<DiscoveryPage />} />
        <Route path="/api" element={<ApiDocumentationPage />} />
        <Route path="/repositories/:repoKey" element={<RepositoryPage />} />
        <Route path="/symbols/:repoKey/:symbolKey" element={<SymbolPage />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/account" element={<RequireAuthentication><AccountLayout /></RequireAuthentication>}>
          <Route index element={<AccountOverviewPage />} />
          <Route path="characters" element={<AccountAreaPage area="characters" />} />
          <Route path="symbols" element={<AccountAreaPage area="symbols" />} />
          <Route path="packs" element={<AccountAreaPage area="packs" />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SiteLayout>
  )
}
