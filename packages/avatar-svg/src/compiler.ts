import { DOMParser } from '@xmldom/xmldom'
import type { CompiledSvgNode, SvgElementName } from './contracts.js'

const allowedElements = new Set<SvgElementName>(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
const allowedAttributes = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height',
  'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule',
  'clip-rule', 'opacity', 'transform', 'vector-effect',
])
const unsafeValue = /(?:url\s*\(|javascript:|data:|https?:|<|>)/i

function compileElement(element: Element, sourceName: string): CompiledSvgNode {
  const name = element.tagName as SvgElementName
  if (!allowedElements.has(name)) throw new Error(`${sourceName}: <${element.tagName}> is not allowed`)
  const attributes: Record<string, string> = {}
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index)
    if (!attribute) continue
    if (!allowedAttributes.has(attribute.name) || attribute.name.toLowerCase().startsWith('on')) {
      throw new Error(`${sourceName}: attribute ${attribute.name} is not allowed`)
    }
    if (unsafeValue.test(attribute.value)) throw new Error(`${sourceName}: external or executable SVG value rejected`)
    attributes[attribute.name] = attribute.value
  }
  const children: CompiledSvgNode[] = []
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes.item(index)
    if (child?.nodeType === 1) children.push(compileElement(child as Element, sourceName))
    if (child?.nodeType === 3 && child.nodeValue?.trim()) throw new Error(`${sourceName}: text nodes are not allowed in artwork`)
  }
  return { element: name, attributes, ...(children.length ? { children } : {}) }
}

export function compileSvgSource(source: string, sourceName = 'SVG source'): readonly CompiledSvgNode[] {
  if (/<!doctype|<!entity/i.test(source)) throw new Error(`${sourceName}: document declarations are not allowed`)
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const parseErrors = document.getElementsByTagName('parsererror')
  if (parseErrors.length > 0) throw new Error(`${sourceName}: invalid SVG XML`)
  const root = document.documentElement
  if (root.tagName !== 'svg') throw new Error(`${sourceName}: root element must be <svg>`)
  for (let index = 0; index < root.attributes.length; index += 1) {
    const attribute = root.attributes.item(index)
    if (!attribute) continue
    if (!['xmlns', 'viewBox'].includes(attribute.name)) throw new Error(`${sourceName}: root attribute ${attribute.name} is not allowed`)
  }
  const nodes: CompiledSvgNode[] = []
  for (let index = 0; index < root.childNodes.length; index += 1) {
    const child = root.childNodes.item(index)
    if (child?.nodeType === 1) nodes.push(compileElement(child as Element, sourceName))
    if (child?.nodeType === 3 && child.nodeValue?.trim()) throw new Error(`${sourceName}: text nodes are not allowed in artwork`)
  }
  return nodes
}
