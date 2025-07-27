/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js']
  },
  // Note: api.bodyParser config is set per API route, not globally
}

module.exports = nextConfig