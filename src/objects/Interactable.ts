/**
 * Anything the player can look at to get a contextual HUD prompt.
 * Implementations attach themselves to their meshes via `mesh.userData.interact`
 * and the Game raycasts the crosshair against interactable meshes each frame.
 */
export type InteractKind = 'cube' | 'button' | 'door';

export interface Interactable {
  readonly interactKind: InteractKind;
  /** Prompt line for the HUD, or null when nothing should be shown. */
  prompt(): string | null;
}
