export const iso=()=>new Date().toISOString();
export const utcStamp=()=>new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
