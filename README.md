# Floorguard: NFT stop-loss & take-profit

Non-custodial auto-sell for NFTs. Sign once, sell while you sleep.

- **Sign:** the seller approves `SltpExecutor` and signs EIP-712 `Sell` orders (TP, SL, trailing), each with a hard `minPrice`. TP and SL share a nonce, so only one of them can ever fill.
- **Watch:** a cron hits `/api/cron` every minute (Supabase pg_cron + pg_net). Floor price comes from OpenSea (`OPENSEA_API_KEY` + slug), falls back to Magic Eden, and uses a mock feed for the Sepolia demo collection. A level has to hold for N consecutive checks before it fires, which filters out single dips and wash prints.
- **Sell:** the keeper calls `execute(sell, sig, bid, sig)`. The contract checks both signatures, enforces `bid.price >= minPrice`, and swaps the NFT for WETH directly between the two wallets.
- **Alerts:** optional Telegram alerts via `TELEGRAM_BOT_TOKEN` plus a chat id set per order.

Contracts are in `contracts/Sltp.sol` (Sepolia addresses are in `contracts/deployed.json`). The e2e test is `contracts/e2e.mjs`.

Env: `SUPABASE_URL SUPABASE_ANON_KEY SLTP_DB_KEY CRON_SECRET KEEPER_PRIVATE_KEY` plus optional `OPENSEA_API_KEY MAGICEDEN_API_KEY TELEGRAM_BOT_TOKEN NEXT_PUBLIC_WC_PROJECT_ID`.
