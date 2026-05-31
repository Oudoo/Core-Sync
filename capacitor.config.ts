import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coresync.fluidresonance',
  appName: 'Core Sync: Fluid Resonance',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
