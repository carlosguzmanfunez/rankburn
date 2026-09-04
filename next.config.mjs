/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors now fail the build. If your installed @base-ui/react version
  // types Button props differently, re-enable `ignoreBuildErrors` temporarily
  // rather than deleting code to make it compile.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
