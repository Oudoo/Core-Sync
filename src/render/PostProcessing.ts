/**
 * PostProcessing — lightweight visual feedback effects.
 * All complex GLSL shaders removed: they caused silent black-screen failures
 * on devices where WebGL2 isn't available or the FBM shader is too heavy.
 * Effects are now CSS-based (miss flash) or PixiJS-native (lane pulse).
 */

/** CSS-based red flash overlay shown on a miss. */
export class MissFlash {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed', 'inset:0', 'pointer-events:none',
      'z-index:500', 'background:rgba(255,0,50,0)',
      'transition:background 0.08s ease-out',
    ].join(';');
    document.body.appendChild(this.el);
  }

  trigger(): void {
    this.el.style.background = 'rgba(255,0,50,0.28)';
    setTimeout(() => {
      this.el.style.background = 'rgba(255,0,50,0)';
    }, 80);
  }

  destroy(): void {
    this.el.remove();
  }
}
