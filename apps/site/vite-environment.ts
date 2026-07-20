import { loadEnv } from 'vite'

const DEFAULT_SERVER_PROXY_TARGET = 'http://localhost:3000'

type Environment = Record<string, string | undefined>

interface ServerProxyTargetOptions {
  mode: string
  environmentDirectory: string
  processEnvironment?: Environment
}

export function resolveServerProxyTarget({
  mode,
  environmentDirectory,
  processEnvironment = process.env,
}: ServerProxyTargetOptions) {
  const fileEnvironment = loadEnv(mode, environmentDirectory, 'VITE_')

  return processEnvironment.VITE_SERVER_PROXY_TARGET ??
    fileEnvironment.VITE_SERVER_PROXY_TARGET ??
    DEFAULT_SERVER_PROXY_TARGET
}
