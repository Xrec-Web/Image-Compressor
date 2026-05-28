/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Enable WASM for @jsquash/avif (client-side only)
    if (!isServer) {
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        layers: true,
      };
    }
    return config;
  },
  // Cross-origin isolation lets ffmpeg.wasm use SharedArrayBuffer for its
  // multi-threaded core (much faster video encoding). Without these headers
  // crossOriginIsolated is false and lib/video.ts falls back to the slower
  // single-threaded core.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
