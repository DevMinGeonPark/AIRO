import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
globalThis.fetch = async () => { throw new Error("Network forbidden"); };
const { createToolRunner, bindTripTools } = await import("../src/lib/tool-runtime.ts");
const { createAiroMcpServer } = await import("../src/lib/mcp-server.ts");
const { toolSchemas } = await import("../src/lib/tool-contracts.ts");
const stop = { id:"current-stop", source_id:"original-stop", name:"후쿠오카 숙소" };
const food = [
  { id:"ramen",name:"ラーメン",nameKo:"라멘",nameEn:"RAMEN",day:1,stopId:"original-stop",kind:"restaurant",cuisine:"ramen",addr:"福岡市",hours:"18:00",lat:33.5,lng:130.4,website:"https://example.com",secret:"must-not-leak" },
  { id:"cafe",name:"카페",day:0,stopId:"missing",kind:"cafe",cuisine:"coffee",lat:33.5,lng:130.4,website:"javascript:alert(1)" },
  { id:"long",name:"x".repeat(1000),day:2,stopId:"missing",kind:"food",cuisine:"food",lat:33.5,lng:130.4 },
];
let reads = 0;
const deps = {
  getTrip: async id => id === "mine" ? {trip:{id},stops:[stop]} : null,
  getArchive: async () => { reads++; return {data:{food,documents:[{base64:"private"}]}}; },
  getSavedPlaces: async () => ["ramen","orphan"],
};
const run = createToolRunner(deps,["trips:read"]);
const list = args => run("listSavedPlaces",{tripId:"mine",...args});
assert.equal((await list({})).total,3);
assert.equal((await list({savedOnly:true})).total,1);
assert.equal((await list({day:0})).places[0].id,"cafe");
assert.equal((await list({query:"ＲＡＭＥＮ"})).total,1);
assert.equal((await list({query:"라멘",region:"후쿠오카",day:1})).total,1);
assert.equal((await list({region:"福岡"})).total,1);
assert.equal((await list({query:"absent"})).total,0);
const first=await list({limit:1});
assert.equal(first.nextOffset,1); assert.equal(first.hasMore,true);
const rest=await list({offset:first.nextOffset,limit:2});
assert.deepEqual(rest.places.map(p=>p.id),["cafe","long"]);
assert.equal(rest.nextOffset,null); assert.equal(rest.hasMore,false);
assert.equal(rest.places[0].website,null); assert.equal(rest.places[0].stopId,null);
assert.equal(rest.places[1].name.length,300); assert.deepEqual(rest.places[1].truncatedFields,["name"]);
assert.equal(first.places[0].stopId,"current-stop");
assert.equal(JSON.stringify(first).includes("must-not-leak"),false);
assert.equal(JSON.stringify(first).includes("base64"),false);
assert.equal((await list({offset:99})).hasMore,false);
for (const args of [{limit:21},{offset:-1},{day:-1},{query:" "},{unknown:true}]) assert.equal(toolSchemas.listSavedPlaces.safeParse({tripId:"mine",...args}).success,false);
const before = reads;
await assert.rejects(()=>run("listSavedPlaces",{tripId:"foreign"}),/여행을 찾을 수 없습니다/);
assert.equal(reads,before,"ownership must precede archive reads");
await assert.rejects(()=>createToolRunner(deps,[])("listSavedPlaces",{tripId:"mine"}));
assert.equal((await bindTripTools(run,"mine")("listSavedPlaces",{tripId:"foreign"})).tripId,"mine");
assert.equal((await createToolRunner({...deps,getArchive:async()=>null})("listSavedPlaces",{tripId:"mine"})).total,0);
const server=createAiroMcpServer(run,["trips:read"]);
const client=new Client({name:"saved-places-test",version:"1"});
const [a,b]=InMemoryTransport.createLinkedPair();
await server.connect(a); await client.connect(b);
try {
 const tools=await client.listTools();
 const tool=tools.tools.find(t=>t.name==="listSavedPlaces");
 assert.equal(tool.annotations.readOnlyHint,true); assert.equal(tool.annotations.openWorldHint,false);
 const result=await client.callTool({name:"listSavedPlaces",arguments:{tripId:"mine",query:"라멘"}});
 assert.equal(result.isError,undefined); assert.equal(result.structuredContent.total,1);
 assert.equal(JSON.parse(result.content[0].text).places[0].id,"ramen");
 const denied=await client.callTool({name:"listSavedPlaces",arguments:{tripId:"foreign"}});
 assert.equal(denied.isError,true);
} finally { await client.close(); await server.close(); }
console.log("PASS saved places: filters, pagination, bounded fields, ownership, read permission, empty archive, trip binding, MCP list/call/error");
