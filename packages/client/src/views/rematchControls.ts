/** Client → server rematch messages for completed two-player sessions. */
export type RematchControls = {
  offer: () => void
  accept: () => void
  decline: () => void
  cancel: () => void
}
