import { defineNitroConfig } from 'nitro/config';

export default defineNitroConfig({
  preset: 'cloud-run',
  compressPublicAssets: true,
  serverAssets: [
    {
      baseName: 'public',
      dir: 'public'
    }
  ]
});
