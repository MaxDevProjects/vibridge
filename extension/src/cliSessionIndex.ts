/**
 * Local, read-only index of CLI session metadata.
 * Never read whole transcripts or copy raw user prompts to the relay.
 * Only sessions whose recorded cwd belongs to the selected VS Code workspace
 * are exposed. This file runs on the HOST extension, not in Docker.
 */
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type CliSessionTool = 'codex' | 'claude-code';
export interface IndexedCliSession {
  id:string;
  cliId:CliSessionTool;
  title:string;
  updatedAt:number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DIR_ENTRIES = 2600;
const MAX_CANDIDATES = 180;
const MAX_RETURN = 30;

export function isValidCliSessionId(id:unknown): id is string {
  return typeof id==='string' && UUID.test(id);
}

function titleFromMeta(value:unknown):string | null {
  if(typeof value!=='string')return null;
  const title=value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,85);
  return title.length>=8?title:null;
}
export function workspaceOwnsSession(workspace:string,cwd:string):boolean {
  const root=path.resolve(workspace),actual=path.resolve(cwd);
  const relative=path.relative(root,actual);
  return !!workspace && path.isAbsolute(cwd)
    && (relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)));
}

async function candidateFiles(root:string,depth:number):Promise<Array<{file:string;mtime:number}>> {
  const pending:Array<{dir:string;depth:number}>=[{dir:root,depth:0}];
  const found:Array<{file:string;mtime:number}>=[];
  let examined=0;
  while(pending.length && examined < MAX_DIR_ENTRIES){
    const next=pending.pop()!;
    let items;
    try{items=await fs.readdir(next.dir,{withFileTypes:true})}catch{continue}
    for(const item of items){
      examined++;
      if(examined>MAX_DIR_ENTRIES)break;
      if(item.isSymbolicLink())continue;
      const full=path.join(next.dir,item.name);
      if(item.isDirectory()&&next.depth<depth){pending.push({dir:full,depth:next.depth+1});continue}
      if(!item.isFile()||!item.name.endsWith('.jsonl'))continue;
      try{
        const stats=await fs.stat(full);
        if(!stats.isFile()||stats.size<10)continue;
        found.push({file:full,mtime:stats.mtimeMs});
      }catch{}
    }
  }
  return found.sort((a,b)=>b.mtime-a.mtime).slice(0,MAX_CANDIDATES);
}

async function readHeader(file:string):Promise<Record<string,unknown>[]> {
  let handle:fs.FileHandle|undefined;
  try{
    handle=await fs.open(file,'r');
    const buffer=Buffer.alloc(18_000);
    const result=await handle.read(buffer,0,buffer.length,0);
    const text=buffer.subarray(0,result.bytesRead).toString('utf8');
    const lines=text.split('\n').slice(0,-1).slice(0,35);
    return lines.flatMap(line=>{
      try{
        const value=JSON.parse(line) as unknown;
        return value && typeof value==='object'&&!Array.isArray(value)?[value as Record<string,unknown>]:[];
      }catch{return []}
    });
  }catch{return []}
  finally{await handle?.close()}
}

export async function findCliSessions(workspace:string):Promise<IndexedCliSession[]>{
  if(!workspace||!path.isAbsolute(workspace))return [];
  const canonical=await fs.realpath(workspace).catch(()=>null);
  if(!canonical)return [];
  const stores:Array<{root:string;cliId:CliSessionTool;depth:number}>=[
    {root:path.join(os.homedir(),'.codex','sessions'),cliId:'codex',depth:4},
    {root:path.join(os.homedir(),'.claude','projects'),cliId:'claude-code',depth:2},
  ];
  const results:IndexedCliSession[]=[];
  for(const store of stores){
    const candidates=await candidateFiles(store.root,store.depth);
    for(const entry of candidates){
      const match=path.basename(entry.file).match(/([0-9a-f]{8}-[0-9a-f-]{27,36})\.jsonl$/i);
      const fileId=match?.[1];
      if(!isValidCliSessionId(fileId))continue;
      const header=await readHeader(entry.file);
      let sessionCwd:string|undefined;
      let title:string|null=null;
      for(const record of header){
        const payload=record.payload && typeof record.payload==='object' && !Array.isArray(record.payload)
          ? record.payload as Record<string,unknown>:{};
        const cwd=typeof payload.cwd==='string'?payload.cwd:typeof record.cwd==='string'?record.cwd:undefined;
        if(cwd)sessionCwd=cwd;
        // Native metadata only. Do not use raw user messages or assistant text.
        if(record.type==='custom-title')title=titleFromMeta(record.title)??title;
        if(record.type==='summary')title=titleFromMeta(record.summary)??title;
        if(record.type==='session_meta')title=titleFromMeta(payload.title)??title;
      }
      if(!sessionCwd||!workspaceOwnsSession(canonical,sessionCwd))continue;
      const actual=await fs.realpath(sessionCwd).catch(()=>null);
      if(!actual || !workspaceOwnsSession(canonical,actual))continue;
      results.push({
        id:fileId,cliId:store.cliId,
        title:title??(store.cliId==='codex'?'Session Codex':'Session Claude Code'),
        updatedAt:entry.mtime,
      });
    }
  }
  return results.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,MAX_RETURN);
}
