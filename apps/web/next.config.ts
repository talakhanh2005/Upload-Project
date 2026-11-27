import type { NextConfig } from "next";

const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

if (process.env.VERCEL === "1") {
  if (!publicApiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL must be set for Vercel deployments");
  }

  const parsedApiUrl = new URL(publicApiUrl);
  if (
    parsedApiUrl.protocol !== "https:" ||
    parsedApiUrl.hostname === "localhost" ||
    parsedApiUrl.hostname === "127.0.0.1"
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be an HTTPS non-local URL on Vercel",
    );
  }
}

const config: NextConfig = { output: "standalone" };

export default config;
