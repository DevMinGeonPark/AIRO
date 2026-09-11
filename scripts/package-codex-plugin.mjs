import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve('.private/airo-plugin-marketplace'), repo=resolve('public/plugins/airo.git');
await mkdir(root,{recursive:true});await mkdir(resolve(root,'.agents/plugins'),{recursive:true});await mkdir(resolve(root,'plugins'),{recursive:true});
await rm(resolve(root,'plugins/airo'),{recursive:true,force:true});
await cp('plugins/airo',resolve(root,'plugins/airo'),{recursive:true});
await writeFile(resolve(root,'.agents/plugins/marketplace.json'),JSON.stringify({name:'airo',interface:{displayName:'AIRO'},plugins:[{name:'airo',source:{source:'local',path:'./plugins/airo'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]},null,2)+'\n');
await writeFile(resolve(root,'README.md'),`# AIRO Codex plugin

This repository contains only the AIRO connection plugin, never private trips or app credentials.

Install this marketplace with Codex, then install the airo plugin and run its connect skill:

\`\`\`sh
codex plugin marketplace add https://airo.dev-heptivision.com/plugins/airo.git
codex plugin add airo@airo
\`\`\`

After installation, start a new Codex chat and select **아이로 웹 채팅 연결**. The connect skill runs the installed platform setup script. The end user approves the matching pairing code in AIRO.

The bridge downloads checksum-pinned native runtime files and the unmodified official OpenAI Codex runtime. It uses Codex's own local ChatGPT login. Web requests can only execute AIRO itinerary tools for the selected account/trip; inherited MCP integrations and local commands are disabled in the dedicated runtime. API inference is never an automatic fallback.

Supported: macOS arm64/x64, Linux arm64/x64, Windows x64. Keep the paired computer awake while chatting on the web/mobile. Revoke it from AIRO → 내 AI 연결.

Documentation: https://airo.dev-heptivision.com/docs/codex
`);
function run(command,args,cwd=root){const r=spawnSync(command,args,{cwd,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout;}
run('git',['init','-q']);run('git',['add','README.md','.agents','plugins']);
const changed=run('git',['diff','--cached','--name-only']).trim();
if(changed)run('git',['-c','user.name=AIRO','-c','user.email=noreply@dev-heptivision.com','commit','-qm','Package AIRO Codex connection plugin']);
await mkdir(resolve('public/plugins'),{recursive:true});
await rm(repo,{recursive:true,force:true});run('git',['clone','--bare',root,repo]);run('git',['update-server-info'],repo);
await rm(resolve(repo,'hooks'),{recursive:true,force:true});
await writeFile(resolve(repo,'config'),'[core]\n\tbare = true\n');
await rm(resolve('public/downloads/airo-plugin.zip'),{force:true});
run('zip',['-qr',resolve('public/downloads/airo-plugin.zip'),'airo'],resolve(root,'plugins'));
console.log('Plugin release packaged',run('git',['rev-parse','HEAD']).trim());
