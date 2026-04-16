/** Stable id assigned by the server when a player joins a room (UUID string). */
export type PlayerId = string

export interface PlayerInfo {
  id: PlayerId
  displayName: string
}
