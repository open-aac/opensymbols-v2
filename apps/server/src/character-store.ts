import type { CharacterActionV1, CharacterIdentityV1 } from '@opensymbols/avatar-svg/contracts'

export interface CharacterRecord {
  id: string
  clerkUserId: string
  name: string
  templateKey: 'modular-svg-avatar'
  templateVersion: 1
  configurationVersion: 1
  identity: CharacterIdentityV1
  revision: number
  createdAt: string
  updatedAt: string
}

export interface CharacterWrite {
  name: string
  templateKey: 'modular-svg-avatar'
  templateVersion: 1
  configurationVersion: 1
  identity: CharacterIdentityV1
}

export interface CharacterSymbolRecord {
  id: string
  characterId: string
  name: string
  configurationVersion: 1
  action: CharacterActionV1
  revision: number
  createdAt: string
  updatedAt: string
}

export interface CharacterSymbolWrite {
  name: string
  configurationVersion: 1
  action: CharacterActionV1
}

export type CharacterResult =
  | { kind: 'ok'; character: CharacterRecord }
  | { kind: 'not_found' }
  | { kind: 'account_deleted' }

export type CharacterListResult =
  | { kind: 'ok'; characters: CharacterRecord[] }
  | { kind: 'account_deleted' }

export type CharacterUpdateResult = CharacterResult | { kind: 'conflict' }

export type CharacterDeleteResult =
  | { kind: 'deleted' }
  | { kind: 'has_symbols'; symbolCount: number }
  | { kind: 'not_found' }
  | { kind: 'account_deleted' }

export type CharacterSymbolResult =
  | { kind: 'ok'; symbol: CharacterSymbolRecord }
  | { kind: 'not_found' }
  | { kind: 'account_deleted' }

export type CharacterSymbolListResult =
  | { kind: 'ok'; symbols: CharacterSymbolRecord[] }
  | { kind: 'not_found' }
  | { kind: 'account_deleted' }

export type CharacterSymbolUpdateResult = CharacterSymbolResult | { kind: 'conflict' }

export type CharacterSymbolDeleteResult =
  | { kind: 'deleted' }
  | { kind: 'not_found' }
  | { kind: 'account_deleted' }

export interface CharacterStore {
  listCharacters(clerkUserId: string, now: string): Promise<CharacterListResult>
  findCharacter(clerkUserId: string, id: string, now: string): Promise<CharacterResult>
  createCharacter(clerkUserId: string, id: string, character: CharacterWrite, now: string): Promise<CharacterResult>
  updateCharacter(clerkUserId: string, id: string, character: CharacterWrite, revision: number, now: string): Promise<CharacterUpdateResult>
  deleteCharacter(clerkUserId: string, id: string, now: string): Promise<CharacterDeleteResult>
  listCharacterSymbols(clerkUserId: string, characterId: string, now: string): Promise<CharacterSymbolListResult>
  findCharacterSymbol(clerkUserId: string, id: string, now: string): Promise<CharacterSymbolResult>
  createCharacterSymbol(clerkUserId: string, characterId: string, id: string, symbol: CharacterSymbolWrite, now: string): Promise<CharacterSymbolResult>
  updateCharacterSymbol(clerkUserId: string, id: string, symbol: CharacterSymbolWrite, revision: number, now: string): Promise<CharacterSymbolUpdateResult>
  deleteCharacterSymbol(clerkUserId: string, id: string, now: string): Promise<CharacterSymbolDeleteResult>
  deleteClerkUser(clerkUserId: string, now: string): Promise<void>
}
