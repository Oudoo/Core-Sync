import { Filter, GlProgram } from 'pixi.js';
import { ShaderSources } from '../shaders/ShaderSources';

export class FluidBackgroundFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({
      vertex: ShaderSources.VERTEX_DEFAULT,
      fragment: ShaderSources.FLUID_FRAG,
    });

    super({
      glProgram,
      resources: {
        fluidUniforms: {
          uTime: { value: 0, type: 'f32' },
          uLowEnergy: { value: 0, type: 'f32' },
          uMidEnergy: { value: 0, type: 'f32' },
          uHighEnergy: { value: 0, type: 'f32' },
          uActiveEnergy: { value: 0, type: 'f32' },
        },
      },
    });
  }

  update(time: number, low: number, mid: number, high: number, active: number): void {
    this.resources.fluidUniforms.uTime = time;
    this.resources.fluidUniforms.uLowEnergy = low;
    this.resources.fluidUniforms.uMidEnergy = mid;
    this.resources.fluidUniforms.uHighEnergy = high;
    this.resources.fluidUniforms.uActiveEnergy = active;
  }
}

export class GlowFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({
      vertex: ShaderSources.VERTEX_DEFAULT,
      fragment: ShaderSources.GLOW_FRAG,
    });

    super({
      glProgram,
      resources: {},
    });
  }
}

export class ChromaticAberrationFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({
      vertex: ShaderSources.VERTEX_DEFAULT,
      fragment: ShaderSources.CHROMATIC_FRAG,
    });

    super({
      glProgram,
      resources: {
        missUniforms: {
          uMissIntensity: { value: 0, type: 'f32' },
        },
      },
    });
  }

  setIntensity(intensity: number): void {
    this.resources.missUniforms.uMissIntensity = intensity;
  }
}
