/**
 * Inlined GLSL Shader sources.
 * Prevents packaging / bundling issues with Vite raw text loaders in offline environments.
 */

export const ShaderSources = {
  // Pass-through vertex shader
  VERTEX_DEFAULT: `
    precision highp float;
    attribute vec2 aPosition;
    attribute vec2 aUV;
    
    uniform mat3 uProjectionMatrix;
    uniform mat3 uWorldTransformMatrix;
    
    varying vec2 vTextureCoord;
    
    void main() {
      gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
      vTextureCoord = aUV;
    }
  `,

  // Obsidian-Neon Audio-Reactive Fluid Fragment Shader
  FLUID_FRAG: `
    precision highp float;
    varying vec2 vTextureCoord;
    
    uniform float uTime;
    uniform float uLowEnergy;
    uniform float uMidEnergy;
    uniform float uHighEnergy;
    uniform float uActiveEnergy; // 0.0 to 1.0 from player performance
    
    // Hash-based pseudo-random noise generator
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }
    
    // 4-octave Fractional Brownian Motion
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      vec2 shift = vec2(100.0);
      
      // Rotate grid between octaves to decrease grid alignment artifacts
      mat2 rot = mat2(0.877, 0.479, -0.479, 0.877);
      
      for (int i = 0; i < 4; ++i) {
        v += a * noise(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
      }
      return v;
    }
    
    void main() {
      vec2 uv = vTextureCoord;
      
      // Dynamic scaling parameters
      float speed = 0.15 + uLowEnergy * 0.15;
      float warpScale = 1.8 + uMidEnergy * 0.8;
      
      // 1. First warp layer (domain warping)
      vec2 q = vec2(
        fbm(uv * 2.8 + uTime * speed),
        fbm(uv * 2.8 + vec2(5.2, 1.3) + uTime * speed * 0.85)
      );
      
      // 2. Second warp layer
      vec2 r = vec2(
        fbm(uv * 3.5 + q * warpScale + uTime * speed * 1.2),
        fbm(uv * 3.5 + q * (warpScale * 0.8) - uTime * speed * 0.9)
      );
      
      // Final noise blend
      float f = fbm(uv * 3.0 + r * 2.0);
      
      // Harmonized Obsidian and Neon palettes
      vec3 obsidian = vec3(0.005, 0.008, 0.015); // Deep space dark obsidian
      vec3 magentaNeon = vec3(0.65, 0.02, 0.65); // Magenta bass wave
      vec3 cyanNeon = vec3(0.02, 0.72, 0.72);   // Cyan middle wave
      vec3 amberNeon = vec3(0.85, 0.62, 0.05);   // High frequency splash
      
      // Base mix: blend deep obsidian with magenta based on low frequencies
      vec3 col = mix(obsidian, magentaNeon, f * (0.8 + uLowEnergy * 0.6));
      
      // Secondary mix: layer cyan flows driven by mid bands and player energy
      col = mix(col, cyanNeon, dot(q, r) * (1.1 + uActiveEnergy * 0.5));
      
      // Tertiary highlights: golden flashes on high hats
      col += amberNeon * pow(f, 4.0) * (0.35 + uHighEnergy * 0.8);
      
      // Subtle vignette
      float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
      vignette = clamp(pow(16.0 * vignette, 0.4), 0.0, 1.0);
      col *= vignette;
      
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // Gaussian Bloom / Glow Fragment Shader
  GLOW_FRAG: `
    precision highp float;
    varying vec2 vTextureCoord;
    uniform sampler2D uSampler;
    
    // Simulating 5x5 blur kernel
    void main() {
      vec2 uv = vTextureCoord;
      vec4 base = texture2D(uSampler, uv);
      
      float stepX = 1.8 / 512.0;
      float stepY = 1.8 / 512.0;
      
      vec4 glow = vec4(0.0);
      
      // Simple 9-tap box filter
      glow += texture2D(uSampler, uv + vec2(-stepX, -stepY)) * 0.08;
      glow += texture2D(uSampler, uv + vec2(0.0, -stepY)) * 0.12;
      glow += texture2D(uSampler, uv + vec2(stepX, -stepY)) * 0.08;
      
      glow += texture2D(uSampler, uv + vec2(-stepX, 0.0)) * 0.12;
      glow += base * 0.20;
      glow += texture2D(uSampler, uv + vec2(stepX, 0.0)) * 0.12;
      
      glow += texture2D(uSampler, uv + vec2(-stepX, stepY)) * 0.08;
      glow += texture2D(uSampler, uv + vec2(0.0, stepY)) * 0.12;
      glow += texture2D(uSampler, uv + vec2(stepX, stepY)) * 0.08;
      
      // Output additive overlay
      gl_FragColor = base + glow * 1.4;
    }
  `,

  // Chromatic Aberration Miss Fragment Shader
  CHROMATIC_FRAG: `
    precision highp float;
    varying vec2 vTextureCoord;
    uniform sampler2D uSampler;
    uniform float uMissIntensity; // 0.0 (no miss) to 1.0 (max aberration)
    
    void main() {
      vec2 uv = vTextureCoord;
      vec2 center = vec2(0.5, 0.5);
      vec2 dir = uv - center;
      
      float dist = length(dir);
      
      // Offset vector increases with distance from center
      vec2 offset = dir * dist * 0.042 * uMissIntensity;
      
      float r = texture2D(uSampler, uv - offset).r;
      float g = texture2D(uSampler, uv).g;
      float b = texture2D(uSampler, uv + offset).b;
      
      vec3 color = vec3(r, g, b);
      
      // Desaturate (chromatic gray shift) on miss
      float grey = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(grey), uMissIntensity * 0.45);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `
};
