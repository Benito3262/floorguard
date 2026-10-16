"use client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
const wc = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const config = createConfig({
  chains: [sepolia], ssr: true,
  connectors: [injected(), ...(wc ? [walletConnect({ projectId: wc, showQrModal: true })] : [])],
  transports: { [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com") },
});
export default function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return <WagmiProvider config={config}><QueryClientProvider client={qc}>{children}</QueryClientProvider></WagmiProvider>;
}
