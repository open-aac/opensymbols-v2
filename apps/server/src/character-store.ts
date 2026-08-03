export interface CharacterSettings {
  skinColour: 'original' | 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark'
}

export interface CharacterRecord {
  id: string
  clerkUserId: string
  name: string
  templateKey: string
  templateVersion: number
  configurationVersion: number
  settings: CharacterSettings
  revision: number
  createdAt: string
  updatedAt: string
}

export interface CharacterWrite {
  name: string
  templateKey: string
  templateVersion: number
  configurationVersion: number
  settings: CharacterSettings
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
  | { kind: 'not_found' }
  | { kind: 'account_deleted' }

export interface CharacterStore {
  listCharacters(clerkUserId: string, now: string): Promise<CharacterListResult>
  findCharacter(clerkUserId: string, id: string, now: string): Promise<CharacterResult>
  createCharacter(
    clerkUserId: string,
    id: string,
    character: CharacterWrite,
    now: string,
  ): Promise<CharacterResult>
  updateCharacter(
    clerkUserId: string,
    id: string,
    character: CharacterWrite,
    revision: number,
    now: string,
  ): Promise<CharacterUpdateResult>
  deleteCharacter(clerkUserId: string, id: string, now: string): Promise<CharacterDeleteResult>
  deleteClerkUser(clerkUserId: string, now: string): Promise<void>
}
