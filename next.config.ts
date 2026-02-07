/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  generateBuildId: async () => {
    return Date.now().toString();
  },
};

module.exports = nextConfig;
