// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC721 { function ownerOf(uint256) external view returns (address); function safeTransferFrom(address,address,uint256) external; }
interface IERC20 { function transferFrom(address,address,uint256) external returns (bool); }

/// Non-custodial stop-loss / take-profit executor.
/// Sellers keep their NFT; they approve this contract and sign a Sell order with a hard minimum price.
/// Buyers sign Bids. Only the keeper can match, and only at >= the seller's signed minimum.
contract SltpExecutor {
    bytes32 public immutable DOMAIN;
    bytes32 constant SELL_T = keccak256("Sell(address seller,address nft,uint256 tokenId,uint256 minPrice,address currency,uint256 expiry,uint256 nonce)");
    bytes32 constant BID_T = keccak256("Bid(address buyer,address nft,uint256 tokenId,bool anyToken,uint256 price,address currency,uint256 expiry,uint256 nonce)");
    address public keeper; address public owner;
    mapping(address => mapping(uint256 => bool)) public used; // signer => nonce

    struct Sell { address seller; address nft; uint256 tokenId; uint256 minPrice; address currency; uint256 expiry; uint256 nonce; }
    struct Bid { address buyer; address nft; uint256 tokenId; bool anyToken; uint256 price; address currency; uint256 expiry; uint256 nonce; }

    event Executed(bytes32 sellHash, address indexed seller, address indexed buyer, address nft, uint256 tokenId, uint256 price);
    event Cancelled(address indexed signer, uint256 nonce);

    constructor(address k) {
        keeper = k; owner = msg.sender;
        DOMAIN = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("SLTP"), keccak256("1"), block.chainid, address(this)));
    }
    function setKeeper(address k) external { require(msg.sender == owner, "owner"); keeper = k; }
    function cancel(uint256 nonce) external { used[msg.sender][nonce] = true; emit Cancelled(msg.sender, nonce); }

    function sellHash(Sell calldata s) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN, keccak256(abi.encode(SELL_T, s.seller, s.nft, s.tokenId, s.minPrice, s.currency, s.expiry, s.nonce))));
    }
    function bidHash(Bid calldata b) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN, keccak256(abi.encode(BID_T, b.buyer, b.nft, b.tokenId, b.anyToken, b.price, b.currency, b.expiry, b.nonce))));
    }
    function _rec(bytes32 h, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "sig");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(sig.offset) s := calldataload(add(sig.offset, 32)) v := byte(0, calldataload(add(sig.offset, 64))) }
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "s");
        address a = ecrecover(h, v, r, s); require(a != address(0), "rec"); return a;
    }

    function execute(Sell calldata s, bytes calldata ss, Bid calldata b, bytes calldata bs) external {
        require(msg.sender == keeper, "keeper");
        require(block.timestamp <= s.expiry && block.timestamp <= b.expiry, "expired");
        require(!used[s.seller][s.nonce] && !used[b.buyer][b.nonce], "used");
        require(b.nft == s.nft && (b.anyToken || b.tokenId == s.tokenId), "mismatch");
        require(b.currency == s.currency && b.price >= s.minPrice, "price");
        bytes32 h = sellHash(s);
        require(_rec(h, ss) == s.seller, "sellsig");
        require(_rec(bidHash(b), bs) == b.buyer, "bidsig");
        used[s.seller][s.nonce] = true; used[b.buyer][b.nonce] = true;
        require(IERC20(s.currency).transferFrom(b.buyer, s.seller, b.price), "pay");
        IERC721(s.nft).safeTransferFrom(s.seller, b.buyer, s.tokenId);
        emit Executed(h, s.seller, b.buyer, s.nft, s.tokenId, b.price);
    }
}

contract TestNFT {
    string public name = "SLTP Test Apes"; string public symbol = "STAPE";
    mapping(uint256 => address) public ownerOf; mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved; mapping(address => mapping(address => bool)) public isApprovedForAll;
    uint256 public totalSupply;
    event Transfer(address indexed from, address indexed to, uint256 indexed id);
    event Approval(address indexed o, address indexed s, uint256 indexed id);
    event ApprovalForAll(address indexed o, address indexed op, bool ok);
    function mint(address to, uint256 n) external { for (uint256 i; i < n; i++) { uint256 id = ++totalSupply; ownerOf[id] = to; balanceOf[to]++; emit Transfer(address(0), to, id); } }
    function approve(address s, uint256 id) external { require(msg.sender == ownerOf[id]); getApproved[id] = s; emit Approval(msg.sender, s, id); }
    function setApprovalForAll(address op, bool ok) external { isApprovedForAll[msg.sender][op] = ok; emit ApprovalForAll(msg.sender, op, ok); }
    function transferFrom(address f, address t, uint256 id) public {
        require(f == ownerOf[id], "from"); require(msg.sender == f || isApprovedForAll[f][msg.sender] || msg.sender == getApproved[id], "auth");
        balanceOf[f]--; balanceOf[t]++; ownerOf[id] = t; delete getApproved[id]; emit Transfer(f, t, id);
    }
    function safeTransferFrom(address f, address t, uint256 id) external { transferFrom(f, t, id); }
    function supportsInterface(bytes4 i) external pure returns (bool) { return i == 0x80ac58cd || i == 0x01ffc9a7; }
    function tokenURI(uint256) external pure returns (string memory) { return "data:application/json,{\"name\":\"SLTP Test Ape\"}"; }
}

contract TestWETH {
    string public name = "Test WETH"; string public symbol = "tWETH"; uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed f, address indexed t, uint256 v); event Approval(address indexed o, address indexed s, uint256 v);
    function mint(address to, uint256 v) external { balanceOf[to] += v; emit Transfer(address(0), to, v); }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true; }
    function transfer(address t, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[t] += v; emit Transfer(msg.sender, t, v); return true; }
    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= v;
        balanceOf[f] -= v; balanceOf[t] += v; emit Transfer(f, t, v); return true;
    }
}
