import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DBAdapter, EnrichedEvent, QueryPageMetric, QueryPageParams, QueryPageResult } from '@litemetrics/core';
import { ClickHouseAdapter } from './clickhouse';
import { MongoDBAdapter } from './mongodb';
import { PostgresAdapter } from './postgres';

// No DB mocks, private pools, truncation or skip=green. URLs must point to dedicated ephemeral DBs.
const engines = [
  ['postgres','DATABASE_URL_TEST',(url:string) => new PostgresAdapter(url)],
  ['clickhouse','CLICKHOUSE_URL_TEST',(url:string) => new ClickHouseAdapter(url,{aggregateSnapshotKeeperPath:process.env.LITEMETRICS_AGGREGATE_KEEPER_PATH})],
  ['mongodb','MONGODB_URL_TEST',(url:string) => new MongoDBAdapter(url)],
] as const;
const expected: Record<QueryPageMetric, { key:string; value:number }[]> = {
  top_pages: [{ key:'https://docs.example.test/pricing', value:3 },{ key:'https://docs.example.test/guides', value:1 }],
  top_referrers: [{ key:'google.com', value:3 }],
  top_countries: [{ key:'DE', value:2 },{ key:'TR', value:1 }],
  top_os: [{ key:'Android', value:2 },{ key:'Linux', value:1 }],
  top_app_versions: [{ key:'1.0', value:1 },{ key:'2.0', value:1 }],
  top_devices: [{ key:'mobile', value:2 },{ key:'desktop', value:1 }],
};
const metrics = Object.keys(expected) as QueryPageMetric[];
function fixture(siteId:string, at:number):EnrichedEvent[] {
  const base = { siteId,timestamp:at, sessionId:'session-fixture',visitorId:'alice', geo:{country:'TR'},device:{type:'mobile',browser:'Chrome',os:'Android',appVersion:'1.0'} };
  return [
    {...base,type:'pageview',url:'https://docs.example.test/pricing',referrer:'https://www.google.com/search?q=app'},
    {...base,type:'pageview',url:'https://docs.example.test/pricing',referrer:'https://google.com/'},
    {...base,type:'pageview',visitorId:'bob',url:'https://docs.example.test/guides',referrer:'https://m.google.com/results',geo:{country:'DE'},device:{...base.device,appVersion:'2.0'}},
    {...base,type:'event',visitorId:'bob',name:'subscribe',geo:{country:'DE'},device:{type:'desktop',browser:'Firefox',os:'Linux',appVersion:'2.0'}},
    {...base,type:'identify',userId:'owner-alice'},
    {...base,type:'pageview',url:'https://docs.example.test/pricing',geo:{country:'DE'}},
  ];
}
for (const [engine,variable,construct] of engines) describe(`${engine} queryPage real contract`, () => {
  let db:DBAdapter; let siteId:string; let at:number; let range:{dateFrom:string;dateTo:string};
  beforeAll(async () => {
    const url = process.env[variable]; if (!url) throw new Error(`INTEGRATION_UNAVAILABLE: ${variable} dedicated database required; this gate cannot be green without ${engine}`);
    if(engine==='clickhouse'&&!process.env.LITEMETRICS_AGGREGATE_KEEPER_PATH)throw new Error('INTEGRATION_UNAVAILABLE: LITEMETRICS_AGGREGATE_KEEPER_PATH explicit Atomic+Keeper capability setup required');
    db = construct(url); await db.init();
  },60000);
  beforeEach(async () => {
    const site = await db.createSite({name:`HQ blind page ${engine} ${Date.now()}`,type:'web',domain:'docs.example.test',conversionEvents:[]});
    siteId=site.siteId; at=Date.now()-1000;
    range={dateFrom:new Date(at-60000).toISOString(),dateTo:new Date(at+60000).toISOString()};
    await db.insertEvents(fixture(siteId,at));
  });
  afterEach(async () => { if (siteId) await db.deleteSite(siteId); });
  afterAll(async () => { if (db) await db.close(); });
  const page = (q:Partial<QueryPageParams>={}) => db.queryPage!({siteId,metric:'top_pages',period:'custom',...range,timezone:'UTC',limit:30,...q});
  it.each(metrics)('happy %s has exact values, canonical order and full denominator', async metric => {
    const r=await page({metric}); const sum=expected[metric].reduce((n,p)=>n+p.value,0);
    expect(r.data.map(({key,value})=>({key,value}))).toEqual(expected[metric]);
    expect(r.rowCount).toBe(expected[metric].length); expect(r.valueSum).toBe(sum); expect(r.denominatorValue).toBe(sum);
    expect(r.denominatorKind).toBe('bucket_sum'); expect(r.measure).toBe(metric==='top_pages'||metric==='top_referrers'?'pageviews':'visitors');
    expect(r.data.map(p=>p.share)).toEqual(expected[metric].map(p=>p.value/sum));
    expect(r.nextCursor).toBeNull(); expect(r.previousCursor).toBeNull();
    expect(Date.parse(r.snapshot.expiresAt)-Date.parse(r.snapshot.createdAt)).toBe(600000);
  });
  it('empty eligible key set is a real complete zero relation',async()=>{
    const r=await page({metric:'top_countries',keys:[]});
    expect(r.data).toEqual([]);expect(r.rowCount).toBe(0);expect(r.valueSum).toBe(0);expect(r.denominatorValue).toBe(0);expect(r.nextCursor).toBeNull();
  });
  it('search and minCount filter the full relation before paging and shares',async()=>{
    const r=await page({metric:'top_countries',search:'de',minCount:2,limit:1});
    expect(r.data).toEqual([{key:'DE',value:2,share:1}]);expect(r.rowCount).toBe(1);expect(r.valueSum).toBe(2);expect(r.denominatorValue).toBe(2);expect(r.nextCursor).toBeNull();
  });
  it('contradictory event type AND metric eligibility returns empty',async()=>{
    const r=await page({filters:{type:'event'}});
    expect(r.data).toEqual([]);expect(r.rowCount).toBe(0);expect(r.valueSum).toBe(0);
  });
  it('country event filter cannot be overwritten by non-null eligibility',async()=>{
    const r=await page({metric:'top_countries',filters:{'geo.country':'TR'}});
    expect(r.data).toEqual([{key:'TR',value:1,share:1}]);expect(r.rowCount).toBe(1);
  });
  it('forward back forward retains equal-value byte-order ties',async()=>{
    const first=await page({metric:'top_app_versions',limit:1});
    const second=await page({metric:'top_app_versions',limit:1,cursor:first.nextCursor!,snapshot:first.snapshot.id});
    expect(first.data).toEqual([{key:'1.0',value:1,share:0.5}]);expect(second.data).toEqual([{key:'2.0',value:1,share:0.5}]);
    expect(second.nextCursor).toBeNull();expect(second.previousCursor).not.toBeNull();
    const back=await page({metric:'top_app_versions',limit:1,cursor:second.previousCursor!,snapshot:first.snapshot.id});
    expect(back.data).toEqual(first.data);expect(back.snapshot).toEqual(first.snapshot);
    const again=await page({metric:'top_app_versions',limit:1,cursor:back.nextCursor!,snapshot:first.snapshot.id});expect(again.data).toEqual(second.data);
  });
  it('old root and next page stay frozen after source insertion and deletion',async()=>{
    const first=await page({limit:1});
    await db.insertEvents(Array.from({length:10},(_,i)=>({...fixture(siteId,at)[0],visitorId:`late-${i}`,url:'https://docs.example.test/new-winner'})));
    await db.deleteUserEvents(siteId,'alice');
    const root=await page({limit:1,snapshot:first.snapshot.id});
    const next=await page({limit:1,snapshot:first.snapshot.id,cursor:first.nextCursor!});
    expect(root.data).toEqual(first.data);expect(next.data).toEqual([{key:'https://docs.example.test/guides',value:1,share:0.25}]);
    expect(next.rowCount).toBe(2);expect(next.denominatorValue).toBe(4);
    const fresh=await page({limit:1});expect(fresh.data[0]).toEqual({key:'https://docs.example.test/new-winner',value:10,share:10/11});
  });
  it('rejects scope, limit, signature and explicit-snapshot disagreement',async()=>{
    const first=await page({limit:1});
    await expect(page({limit:2,cursor:first.nextCursor!,snapshot:first.snapshot.id})).rejects.toMatchObject({code:'cursor_query_mismatch',status:400});
    await expect(page({limit:1,metric:'top_countries',cursor:first.nextCursor!})).rejects.toMatchObject({code:'cursor_query_mismatch',status:400});
    await expect(page({limit:1,cursor:first.nextCursor!+'tamper'})).rejects.toMatchObject({code:'invalid_cursor',status:400});
    await expect(page({limit:1,cursor:first.nextCursor!,snapshot:'other-snapshot'})).rejects.toMatchObject({status:400});
    await expect(page({snapshot:'missing-authorized-snapshot'})).rejects.toMatchObject({code:'snapshot_expired',status:409});
  });
  it('single-flights concurrent identical fresh roots',async()=>{
    const roots=await Promise.all(Array.from({length:8},()=>page({metric:'top_os',limit:1})));
    expect(new Set(roots.map(r=>r.snapshot.id)).size).toBe(1);expect(roots.map(r=>r.data)).toEqual(Array.from({length:8},()=>[{key:'Android',value:2,share:2/3}]));
  });
  it('site deletion rejects an existing snapshot instead of exposing orphaned rows',async()=>{
    const first=await page({limit:1});await db.deleteSite(siteId);
    await expect(page({limit:1,cursor:first.nextCursor!,snapshot:first.snapshot.id})).rejects.toMatchObject({code:'site_not_found',status:404});
  });
  it('1005 equal buckets are fully reachable; legacy top-N remains limited',async()=>{
    await db.deleteUserEvents(siteId,'alice');await db.deleteUserEvents(siteId,'bob');
    const urls=Array.from({length:1005},(_,n)=>`https://docs.example.test/bucket-${String(n).padStart(4,'0')}`);
    await db.insertEvents(urls.map((url,n)=>({...fixture(siteId,at)[0],visitorId:`visitor-${n}`,url})));
    const rows:string[]=[];let cursor:string|undefined;let snapshot:string|undefined;let r:QueryPageResult;
    do {r=await page({limit:50,cursor,snapshot});snapshot=r.snapshot.id;rows.push(...r.data.map(p=>p.key));
      expect(r.data.length).toBeLessThanOrEqual(50);expect(r.rowCount).toBe(1005);expect(r.denominatorValue).toBe(1005);cursor=r.nextCursor??undefined;
    }while(cursor);
    expect(rows).toEqual(urls);expect(new Set(rows).size).toBe(1005);
    const legacy=await db.query({siteId,metric:'top_pages',period:'custom',...range,limit:50});expect(legacy.data).toHaveLength(50);expect(legacy.total).toBe(50);
  },60000);
});

// No explicit shared coordination capability must fail named503 even if legacy ClickHouse reads work.
describe('ClickHouse new snapshot capability opt-in',()=>{
 let db:ClickHouseAdapter;let siteId:string;
 beforeAll(async()=>{const url=process.env.CLICKHOUSE_URL_TEST;if(!url)throw new Error('INTEGRATION_UNAVAILABLE: CLICKHOUSE_URL_TEST dedicated Atomic+Keeper database required');db=new ClickHouseAdapter(url);await db.init();const site=await db.createSite({name:'HQ missing capability contract',type:'web',domain:'docs.example.test',conversionEvents:[]});siteId=site.siteId;},60000);
 afterAll(async()=>{if(db){if(siteId)await db.deleteSite(siteId);await db.close();}});
 it('unconfigured coordination returns aggregate_snapshot_unavailable, never local fallback',async()=>{await expect(db.queryPage!({siteId,metric:'top_pages',period:'7d',timezone:'UTC',limit:30})).rejects.toMatchObject({code:'aggregate_snapshot_unavailable',status:503});});
});
