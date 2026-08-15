import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  cancelLibraryImport,
  completeLibraryImportUpload,
  createLibraryImport,
  getLibraryImport,
  getLibraryImportRepositories,
  getLibraryImports,
  retryLibraryImport,
  uploadLibraryImport,
  type LibraryImportDetail,
  type LibraryImportDraft,
} from '../api'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  FormActions,
  PageSection,
  SelectField,
  StatusMessage,
  Surface,
  TextField,
} from '../components/ui'
import { useAppAuth } from './authentication'
import './administrator-imports.css'

const statusLabels: Record<LibraryImportDraft['status'], string> = {
  awaiting_upload: 'Awaiting upload', uploaded: 'Uploaded', validating: 'Validating',
  review_ready: 'Review ready', invalid: 'Invalid', publishing: 'Publishing',
  published_search_pending: 'Published, search pending', published: 'Published',
  publish_failed: 'Publish failed', expired: 'Expired', canceled: 'Canceled',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function AdministratorImportsPage() {
  const auth = useAppAuth()
  const [imports, setImports] = useState<LibraryImportDraft[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { void getLibraryImports(auth.getToken).then(setImports).catch(() => setFailed(true)) }, [auth.getToken])
  return (
    <PageSection className="admin-imports">
      <p className="eyebrow">Open Symbols administration</p>
      <div className="admin-imports__heading">
        <div><h1>Library imports</h1><p>Upload libraries into private quarantine and review validation before anything is published.</p></div>
        <ButtonLink to="/admin/imports/new" variant="primary">New library import</ButtonLink>
      </div>
      <StatusMessage status="status">This workflow does not publish symbols yet. Publishing arrives in the next phase.</StatusMessage>
      {failed && <StatusMessage status="alert">Library imports could not be loaded.</StatusMessage>}
      {!imports && !failed && <StatusMessage status="status">Loading library imports…</StatusMessage>}
      {imports?.length === 0 && <EmptyState heading="No import drafts yet" description="Create a draft to prove the secure upload and validation flow." />}
      {imports && imports.length > 0 && (
        <div className="admin-imports__cards">
          {imports.map((draft) => (
            <Surface className="admin-import-card" key={draft.id}>
              <Badge>{statusLabels[draft.status]}</Badge>
              <h2><Link to={`/admin/imports/${draft.id}`}>{draft.repositoryName || draft.repositoryKey || 'Library import draft'}</Link></h2>
              <p>{draft.kind === 'new_library' ? 'New library' : 'Existing library'} · Updated {formatDate(draft.updatedAt)}</p>
            </Surface>
          ))}
        </div>
      )}
    </PageSection>
  )
}

export function NewAdministratorImportPage() {
  const auth = useAppAuth()
  const navigate = useNavigate()
  const [kind, setKind] = useState<'new_library' | 'existing_library'>('new_library')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [repositories, setRepositories] = useState<Array<{ id: number; key: string; name: string }> | null>(null)
  const [repositoriesFailed, setRepositoriesFailed] = useState(false)

  useEffect(() => {
    if (kind !== 'existing_library' || repositories) return
    void getLibraryImportRepositories(auth.getToken)
      .then((value) => { setRepositories(value); setRepositoriesFailed(false) })
      .catch(() => setRepositoriesFailed(true))
  }, [auth.getToken, kind, repositories])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    setPending(true); setError(false)
    const data = new FormData(event.currentTarget)
    try {
      const created = await createLibraryImport(auth.getToken, {
        kind,
        repository_id: kind === 'existing_library' ? Number(data.get('repository_id')) : null,
        ...(kind === 'new_library' ? {
          repository_key: String(data.get('repository_key')),
          repository_name: String(data.get('repository_name')),
          default_license: String(data.get('default_license')),
          license_url: String(data.get('license_url')),
          attribution_name: String(data.get('attribution_name')),
        } : {}),
      } as Parameters<typeof createLibraryImport>[1])
      await uploadLibraryImport(auth.getToken, created.upload, file, setProgress)
      await completeLibraryImportUpload(auth.getToken, created.draft.id)
      navigate(`/admin/imports/${created.draft.id}`)
    } catch { setError(true); setPending(false) }
  }

  return (
    <PageSection className="admin-imports">
      <p className="eyebrow">Library imports</p><h1>New import draft</h1>
      <p>The ZIP stays private while Open Symbols validates its files. Nothing is published in this phase.</p>
      {error && <StatusMessage status="alert">The draft could not be uploaded. Check the fields and try again.</StatusMessage>}
      <form className="admin-import-form" onSubmit={submit}>
        <SelectField id="import-kind" label="Import type" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          <option value="new_library">Create a new library</option><option value="existing_library">Add to an existing library</option>
        </SelectField>
        {kind === 'new_library' ? <>
          <TextField id="repository-key" name="repository_key" label="Repository key" required pattern="[a-z0-9-]+" />
          <TextField id="repository-name" name="repository_name" label="Library name" required />
          <TextField id="default-license" name="default_license" label="Default licence" required />
          <TextField id="license-url" name="license_url" label="Licence URL" type="url" pattern="https://.*" required />
          <TextField id="attribution-name" name="attribution_name" label="Attribution name" required />
        </> : <>
          {repositoriesFailed && <StatusMessage status="alert">The public libraries could not be loaded.</StatusMessage>}
          <SelectField
            id="repository-id"
            name="repository_id"
            label="Existing library"
            required
            loading={!repositories && !repositoriesFailed}
            disabled={repositoriesFailed}
          >
            <option value="">Choose a public library</option>
            {repositories?.map((repository) => (
              <option key={repository.id} value={repository.id}>{repository.name} ({repository.key})</option>
            ))}
          </SelectField>
        </>}
        <TextField id="library-zip" label="Library ZIP" type="file" accept=".zip,application/zip" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        {pending && <StatusMessage status="status">Uploading and queuing validation: {progress}%</StatusMessage>}
        <FormActions><Button type="submit" variant="primary" disabled={pending || !file}>Upload for review</Button><ButtonLink to="/admin/imports">Cancel</ButtonLink></FormActions>
      </form>
    </PageSection>
  )
}

export function AdministratorImportDetailPage() {
  const auth = useAppAuth(); const { id = '' } = useParams(); const navigate = useNavigate()
  const [draft, setDraft] = useState<LibraryImportDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const active = draft?.status === 'uploaded' || draft?.status === 'validating'
  useEffect(() => {
    let mounted = true
    const load = () => getLibraryImport(auth.getToken, id).then((value) => { if (mounted) setDraft(value) }).catch(() => { if (mounted) setFailed(true) })
    void load()
    const interval = active ? setInterval(() => { if (mounted) void load() }, 1_500) : undefined
    return () => { mounted = false; if (interval) clearInterval(interval) }
  }, [active, auth.getToken, id])
  if (failed) return <PageSection><StatusMessage status="alert">This import could not be loaded.</StatusMessage></PageSection>
  if (!draft) return <PageSection><StatusMessage status="status">Loading import review…</StatusMessage></PageSection>
  const grouped = draft.results.reduce((groups, result) => {
    const path = result.path || 'Archive'
    const entries = groups.get(path) ?? []
    entries.push(result)
    groups.set(path, entries)
    return groups
  }, new Map<string, LibraryImportDetail['results']>())
  return (
    <PageSection className="admin-imports">
      <p className="eyebrow">Library import review</p><h1>{draft.repositoryName || draft.repositoryKey || 'Import draft'}</h1>
      <StatusMessage status={draft.status === 'invalid' ? 'alert' : 'status'}>
        {statusLabels[draft.status]}{active ? '… This page updates automatically.' : '.'}
      </StatusMessage>
      <Surface tone="accent"><h2>Review only</h2><p>No symbols have been published. Publication and search synchronization are the next phase.</p><Button disabled>Publish library — coming next</Button></Surface>
      <h2>Validation findings</h2>
      {draft.results.length === 0 ? <p>No warnings or errors were reported.</p> : [...grouped].map(([path, results]) => (
        <section className="admin-import-finding" key={path}><h3>{path}</h3><ul>{results.map((result) => <li key={`${result.code}-${result.message}`}><strong>{result.severity}:</strong> {result.message}</li>)}</ul></section>
      ))}
      <h2>Accepted files</h2>
      {draft.files.length === 0 ? <p>No files have been accepted yet.</p> : <div className="admin-import-table-wrap"><table><thead><tr><th>Path</th><th>Type</th><th>Size</th><th>Sanitized</th></tr></thead><tbody>{draft.files.map((file) => <tr key={file.path}><th>{file.path}</th><td>{file.mediaType}</td><td>{file.size.toLocaleString()} bytes</td><td>{file.sanitized ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>}
      <h2>Audit history</h2><ol>{draft.auditEvents.map((event, index) => <li key={`${event.createdAt}-${index}`}>{event.eventType.replaceAll('_', ' ')} by {event.actorClerkUserId} · {formatDate(event.createdAt)}</li>)}</ol>
      <FormActions>
        {draft.status === 'invalid' && <Button onClick={() => void retryLibraryImport(auth.getToken, id).then(() => setDraft({ ...draft, status: 'validating' }))}>Retry validation</Button>}
        {['awaiting_upload', 'uploaded', 'validating', 'review_ready', 'invalid'].includes(draft.status) && <Button onClick={() => void cancelLibraryImport(auth.getToken, id).then(() => navigate('/admin/imports'))}>Cancel draft</Button>}
        <ButtonLink to="/admin/imports">All imports</ButtonLink>
      </FormActions>
    </PageSection>
  )
}
