import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署需要 standalone 输出
  output: 'standalone',

  // 图片优化配置
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  // 外部包配置（PDF 解析库）
  serverExternalPackages: ['unpdf'],

  // 增大 API body 解析限制以支持大文件上传
  experimental: {
    // Next buffers request bodies for middleware/proxy up to 10MB by default.
    // Large multipart uploads (e.g. /api/upload) need a higher limit so req.formData() works.
    // Note: Next 16 warns middlewareClientMaxBodySize is deprecated in favor of proxyClientMaxBodySize
    proxyClientMaxBodySize: '50mb',
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
