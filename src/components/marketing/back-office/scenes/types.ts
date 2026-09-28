export interface SceneProps {
  /** This scene is the one on stage. */
  active: boolean;
  /** Animations allowed (mounted + no reduced motion). */
  enhanced: boolean;
  /** Bumps each time the scene (re)starts, so replays run from the top. */
  nonce: number;
}
