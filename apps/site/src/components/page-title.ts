import { useEffect } from 'react'

const PRODUCT_NAME = 'Open Symbols'

export function formatPageTitle(label: string) {
  return label === PRODUCT_NAME ? PRODUCT_NAME : `${label} | ${PRODUCT_NAME}`
}

export function usePageTitle(label?: string) {
  useEffect(() => {
    if (label) document.title = formatPageTitle(label)
  }, [label])
}
