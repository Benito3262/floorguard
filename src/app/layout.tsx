import "./globals.css";
import Providers from "./providers";
export const metadata = { title: "Floorguard: NFT stop-loss & take-profit", description: "Sell your NFTs at your stop-loss or take-profit while you sleep. Non-custodial." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
