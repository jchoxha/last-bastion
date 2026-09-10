export const SAVE_KEY='last-bastion-save-v1';
export type SaveGame={version:1;savedAt:string;seed:string;classId:string;config:{seed:string;size:number;hilliness:number;trees:number;scale:number;dynamic?:boolean;maxSize?:number;terrainMode?:'rolling'|'plateaus'};state:{wave:number;gold:number;phase:string;[key:string]:unknown};[key:string]:unknown};
export function parseSave(raw:string):SaveGame{
 if(raw.length>12000000)throw new Error('Save file is too large.');const s=JSON.parse(raw);
 if(s?.version!==1||!['knight','ranger','pyromancer'].includes(s.classId)||typeof s.seed!=='string'||s.seed.length>80||typeof s.savedAt!=='string'||!Number.isFinite(Date.parse(s.savedAt)))throw new Error('Unsupported or damaged save.');
 const c=s.config;if(!c||!Number.isInteger(c.size)||c.size<64||(!['rolling','plateaus'].includes(c.terrainMode)&&c.size>1024)||c.size%2||!Number.isFinite(c.scale)||c.scale<.25||c.scale>4||!Number.isFinite(c.hilliness)||c.hilliness<0||c.hilliness>1||!Number.isFinite(c.trees)||c.trees<0||c.trees>.6)throw new Error('Invalid saved world settings.');
 if(c.maxSize!==undefined&&(!Number.isInteger(c.maxSize)||c.maxSize<64||c.maxSize>1024||c.maxSize%2))throw new Error('Invalid expansion limit.');
 if(!s.state||!Number.isFinite(s.state.wave)||!Number.isFinite(s.state.gold)||!['explore','build','fight'].includes(s.state.phase)||!Array.isArray(s.cells)||s.cells.length!==c.size)throw new Error('Incomplete saved run.');
 return s;
}
