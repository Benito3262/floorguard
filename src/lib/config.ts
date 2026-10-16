import { parseAbi } from "viem";
export const CHAIN_ID = 11155111;
export const RPC = process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";
export const EXECUTOR = "0x516b34ec9168b9986a5bc3867e476892ae3193b3" as const;
export const TEST_NFT = "0x563c8af4eedba3026c91cc6e938b6e92502e71a2" as const;
export const TWETH = "0x3e4b86296ee99a419237d17f648f21494af3b9e9" as const;
export const DOMAIN = { name: "SLTP", version: "1", chainId: CHAIN_ID, verifyingContract: EXECUTOR } as const;
export const SELL_TYPES = { Sell: [
  { name: "seller", type: "address" }, { name: "nft", type: "address" }, { name: "tokenId", type: "uint256" },
  { name: "minPrice", type: "uint256" }, { name: "currency", type: "address" }, { name: "expiry", type: "uint256" }, { name: "nonce", type: "uint256" } ] } as const;
export const BID_TYPES = { Bid: [
  { name: "buyer", type: "address" }, { name: "nft", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "anyToken", type: "bool" },
  { name: "price", type: "uint256" }, { name: "currency", type: "address" }, { name: "expiry", type: "uint256" }, { name: "nonce", type: "uint256" } ] } as const;
export const EXECUTOR_ABI = parseAbi([
  "struct Sell { address seller; address nft; uint256 tokenId; uint256 minPrice; address currency; uint256 expiry; uint256 nonce; }",
  "struct Bid { address buyer; address nft; uint256 tokenId; bool anyToken; uint256 price; address currency; uint256 expiry; uint256 nonce; }",
  "function execute(Sell s, bytes ss, Bid b, bytes bs)",
  "function cancel(uint256 nonce)",
  "function used(address, uint256) view returns (bool)",
]);
export const NFT_ABI = parseAbi([
  "function mint(address to, uint256 n)", "function ownerOf(uint256) view returns (address)", "function totalSupply() view returns (uint256)",
  "function setApprovalForAll(address op, bool ok)", "function isApprovedForAll(address o, address op) view returns (bool)",
]);
export const ERC20_ABI = parseAbi([
  "function mint(address to, uint256 v)", "function approve(address s, uint256 v) returns (bool)",
  "function balanceOf(address) view returns (uint256)", "function allowance(address, address) view returns (uint256)",
]);
export type SellOrder = { seller: string; nft: string; tokenId: string; minPrice: string; currency: string; expiry: string; nonce: string };
export type BidOrder = { buyer: string; nft: string; tokenId: string; anyToken: boolean; price: string; currency: string; expiry: string; nonce: string };
