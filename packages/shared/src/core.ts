/** Stable id assigned by the server when a player joins a room (UUID string). */
export type PlayerId = string

/** Room seat / lobby side; first joiner is `red`, second is `yellow`. */
export type Color = 'red' | 'yellow'

export interface PlayerInfo {
  id: PlayerId
  displayName: string
}
