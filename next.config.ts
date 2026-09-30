import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// O Wi-Fi pode receber outro IP; atualiza as origens locais a cada inicio.
const localAddresses = Object.values(networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter(({ family, internal, address }) =>
    family === "IPv4" &&
    !internal &&
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)
  )
  .map(({ address }) => address);

const nextConfig: NextConfig = {
  allowedDevOrigins: localAddresses,
};

export default nextConfig;
