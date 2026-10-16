// End-to-end on Sepolia against the live app. Seller = test wallet A, buyer = test wallet B.
import fs from 'fs';import {createWalletClient,createPublicClient,http,parseEther,parseAbi} from 'viem';import {privateKeyToAccount} from 'viem/accounts';import {sepolia} from 'viem/chains';
const APP=process.env.APP||'https://floorguard-pi.vercel.app', CRON=process.env.CRON_KEY;
const D=JSON.parse(fs.readFileSync('deployed.json'));const tw=JSON.parse(fs.readFileSync('/workspace/paybox/.test-wallets.json'));
const rpc=http('https://ethereum-sepolia-rpc.publicnode.com');const pub=createPublicClient({chain:sepolia,transport:rpc});
const seller=privateKeyToAccount(tw.payer.key),buyer=privateKeyToAccount(tw.payee.key);
const ws=createWalletClient({account:seller,chain:sepolia,transport:rpc}),wb=createWalletClient({account:buyer,chain:sepolia,transport:rpc});
const domain={name:'SLTP',version:'1',chainId:11155111,verifyingContract:D.executor};
const SELL={Sell:[{name:'seller',type:'address'},{name:'nft',type:'address'},{name:'tokenId',type:'uint256'},{name:'minPrice',type:'uint256'},{name:'currency',type:'address'},{name:'expiry',type:'uint256'},{name:'nonce',type:'uint256'}]};
const BID={Bid:[{name:'buyer',type:'address'},{name:'nft',type:'address'},{name:'tokenId',type:'uint256'},{name:'anyToken',type:'bool'},{name:'price',type:'uint256'},{name:'currency',type:'address'},{name:'expiry',type:'uint256'},{name:'nonce',type:'uint256'}]};
const nftAbi=parseAbi(['function setApprovalForAll(address,bool)','function ownerOf(uint256) view returns (address)']),erc=parseAbi(['function approve(address,uint256) returns (bool)','function balanceOf(address) view returns (uint256)']);
const str=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='bigint'?String(v):v]));
const post=(p,b)=>fetch(APP+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
const cron=()=>fetch(`${APP}/api/cron?key=${CRON}`).then(r=>r.json());
const exp=BigInt(Math.floor(Date.now()/1000)+30*86400);
async function arm(tokenId,tp,sl){const nonce=BigInt(Date.now())+BigInt(tokenId);const legs=[];
 for(const [kind,trig,min] of [['tp',tp,tp],['sl',sl,(sl*0.9).toFixed(6)]]){const sell={seller:seller.address,nft:D.nft,tokenId:BigInt(tokenId),minPrice:parseEther(String(min)),currency:D.weth,expiry:exp,nonce};
  legs.push({kind,trigger_price:trig,sell:str(sell),sig:await ws.signTypedData({domain,types:SELL,primaryType:'Sell',message:sell})});}
 const r=await post('/api/rules',{legs,confirm_n:3});if(r.error)throw r.error;return r.rules;}
async function bid(px){const b={buyer:buyer.address,nft:D.nft,tokenId:0n,anyToken:true,price:parseEther(px),currency:D.weth,expiry:exp,nonce:BigInt(Date.now())};
 return post('/api/bids',{bid:str(b),sig:await wb.signTypedData({domain,types:BID,primaryType:'Bid',message:b})});}
const floor=f=>post('/api/price',{floor:f});
const tick=async l=>{const r=await cron();console.log(l,JSON.stringify(r.results.map(x=>({k:x.kind,id:x.id?.slice(0,8),p:x.price,lvl:x.level,h:x.hits,ex:x.executed,err:x.exec_error||x.error}))));return r;};
const wait=h=>pub.waitForTransactionReceipt({hash:h});
console.log('approve NFT', await ws.writeContract({address:D.nft,abi:nftAbi,functionName:'setApprovalForAll',args:[D.executor,true]}).then(async h=>(await wait(h),h)));
console.log('approve tWETH', await wb.writeContract({address:D.weth,abi:erc,functionName:'approve',args:[D.executor,2n**255n]}).then(async h=>(await wait(h),h)));
await floor(1.0);
const g1=await arm(1,1.5,0.6), g2=await arm(2,1.2,0.5); console.log('armed', [...g1,...g2].map(r=>`${r.kind}#${r.token_id}`).join(' '));
await tick('floor 1.0');
console.log('-- wash/dip filter: one print at 0.3, then back'); await floor(0.3); await tick('dip 0.3'); await floor(1.0); await tick('back 1.0');
console.log('-- SL scenario'); await bid('0.57'); await floor(0.55);
for(let i=0;i<3;i++) await tick('floor 0.55 #'+i);
console.log('owner #1 ->', await pub.readContract({address:D.nft,abi:nftAbi,functionName:'ownerOf',args:[1n]}));
console.log('-- TP scenario'); await floor(1.25); await bid('1.3');
for(let i=0;i<4;i++) await tick('floor 1.25 #'+i);
console.log('owner #2 ->', await pub.readContract({address:D.nft,abi:nftAbi,functionName:'ownerOf',args:[2n]}));
const all=await fetch(APP+'/api/rules?owner='+seller.address).then(r=>r.json());
console.log(all.rules.map(r=>`${r.kind}#${r.token_id} ${r.status} ${r.exec_tx||''} ${r.note||''}`).join('\n'));
