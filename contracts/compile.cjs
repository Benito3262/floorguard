const solc=require('solc'),fs=require('fs');
const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Sltp.sol':{content:fs.readFileSync('Sltp.sol','utf8')}},settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
if(out.errors)out.errors.forEach(e=>console.log(e.formattedMessage));
const r={};for(const[k,v]of Object.entries(out.contracts['Sltp.sol']))r[k]={abi:v.abi,bytecode:'0x'+v.evm.bytecode.object};
fs.writeFileSync('artifacts.json',JSON.stringify(r));console.log(Object.keys(r));
