/**
 * Xavfsizlik sarlavhalari: CSP (faqat o'z domeni, API va fayl serveri), clickjacking va MIME himoyasi.
 * Production'da NEXT_PUBLIC_API_URL va S3_PUBLIC_URL https bo'lishi shart.
 */
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const files = process.env.NEXT_PUBLIC_FILES_URL ?? "http://localhost:9000";
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next.js inline skriptlari uchun; productionda nonce'ga o'tkazish tavsiya etiladi
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${files}`,
  `connect-src 'self' ${api} ${files}${isDev ? " ws:" : ""}`,
  "font-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@ip/core"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
