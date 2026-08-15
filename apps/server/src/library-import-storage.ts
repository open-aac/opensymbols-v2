import { Readable } from 'node:stream'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import type { ImportObjectStorage, PresignedUpload } from './library-import-types.js'

export interface S3ImportStorageOptions {
  bucket: string
  region: string
  endpoint?: string
  forcePathStyle?: boolean
  client?: S3Client
  now?: () => Date
}

function required(value: string | undefined, name: string) {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} must not be empty`)
  return normalized
}

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const sourceKeyPattern = new RegExp(`^imports/${uuidPattern}/source\\.zip$`)
const extractedKeyPattern = new RegExp(`^imports/${uuidPattern}/extracted/[0-9a-f]{64}\\.(?:svg|png|jpg|jpeg|json)$`)
const readableKeyPattern = new RegExp(`^imports/${uuidPattern}/(?:source\\.zip|extracted/[0-9a-f]{64}\\.(?:svg|png|jpg|jpeg|json))$`)
const deletePrefixPattern = new RegExp(`^imports/${uuidPattern}/(?:extracted/)?$`)

function assertKey(pattern: RegExp, value: string, operation: string) {
  if (!pattern.test(value)) throw new Error(`${operation} is outside the owned import namespace`)
}

export class S3ImportObjectStorage implements ImportObjectStorage {
  private readonly client: S3Client
  private readonly now: () => Date

  constructor(private readonly options: S3ImportStorageOptions) {
    required(options.bucket, 'IMPORT_QUARANTINE_BUCKET')
    required(options.region, 'IMPORT_QUARANTINE_REGION')
    this.client = options.client ?? new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
    })
    this.now = options.now ?? (() => new Date())
  }

  async createUpload(objectKey: string, maximumBytes: number, expiresInSeconds: number): Promise<PresignedUpload> {
    assertKey(sourceKeyPattern, objectKey, 'Upload object key')
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || !Number.isSafeInteger(expiresInSeconds)
      || expiresInSeconds < 1) throw new Error('Upload limits must be positive integers')
    const contentType = 'application/zip'
    const result = await createPresignedPost(this.client, {
      Bucket: this.options.bucket,
      Key: objectKey,
      Expires: expiresInSeconds,
      Fields: {
        'Content-Type': contentType,
        'x-amz-server-side-encryption': 'AES256',
      },
      Conditions: [
        ['content-length-range', 1, maximumBytes],
        ['eq', '$key', objectKey],
        ['eq', '$Content-Type', contentType],
        ['eq', '$x-amz-server-side-encryption', 'AES256'],
      ],
    })
    return {
      ...result,
      method: 'post',
      objectKey,
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1000).toISOString(),
      maximumBytes,
    }
  }

  async head(objectKey: string) {
    assertKey(sourceKeyPattern, objectKey, 'Head object key')
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }))
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
      }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404) return null
      throw error
    }
  }

  async read(objectKey: string) {
    assertKey(readableKeyPattern, objectKey, 'Read object key')
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: objectKey,
    }))
    if (!result.Body) throw new Error('Stored import object has no body')
    if (result.Body instanceof Readable) return result.Body
    return Readable.from(result.Body as AsyncIterable<Uint8Array>)
  }

  async write(objectKey: string, body: Buffer, contentType: string) {
    assertKey(extractedKeyPattern, objectKey, 'Write object key')
    await this.client.send(new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }))
  }

  async deletePrefix(prefix: string) {
    assertKey(deletePrefixPattern, prefix, 'Delete prefix')
    let continuationToken: string | undefined
    do {
      const listed = await this.client.send(new ListObjectsV2Command({
        Bucket: this.options.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }))
      const objects = (listed.Contents ?? [])
        .flatMap(({ Key }) => Key ? [{ Key }] : [])
      if (objects.length > 0) {
        const deleted = await this.client.send(new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: { Objects: objects, Quiet: true },
        }))
        if ((deleted.Errors?.length ?? 0) > 0) throw new Error('Quarantine object deletion was incomplete')
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
    } while (continuationToken)
  }
}

export function importObjectStorageFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  clientOptions: Pick<S3ClientConfig, 'credentials'> = {},
) {
  const bucket = environment.IMPORT_QUARANTINE_BUCKET?.trim()
  if (!bucket) return undefined
  const endpoint = environment.IMPORT_QUARANTINE_ENDPOINT?.trim() || undefined
  return new S3ImportObjectStorage({
    bucket,
    region: required(environment.IMPORT_QUARANTINE_REGION, 'IMPORT_QUARANTINE_REGION'),
    endpoint,
    forcePathStyle: environment.IMPORT_QUARANTINE_FORCE_PATH_STYLE === 'true',
    client: new S3Client({
      region: required(environment.IMPORT_QUARANTINE_REGION, 'IMPORT_QUARANTINE_REGION'),
      endpoint,
      forcePathStyle: environment.IMPORT_QUARANTINE_FORCE_PATH_STYLE === 'true',
      ...clientOptions,
    }),
  })
}
