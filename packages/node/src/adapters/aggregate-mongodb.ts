import type { Db, MongoClient, Document } from 'mongodb';
import { AggregatePageError, FILTER_COLUMNS, METRIC_COLUMNS, SNAPSHOT_BUILD_TIMEOUT, SNAPSHOT_QUOTA,
  SNAPSHOT_ROW_CAP, capacity, safeCount, unavailable } from '../aggregate-page.js';
import type { AggregateBackend, AggregateRow, AggregateSnapshot, NormalizedPageParams } from '../aggregate-page.js';

const META = 'litemetrics_aggregate_snapshots';
const ROWS = 'litemetrics_aggregate_snapshot_rows';
const OWNERS = 'litemetrics_aggregate_snapshot_owners';
const options = { maxTimeMS: SNAPSHOT_BUILD_TIMEOUT };

/** Fold ASCII only: Mongo's case-insensitive regex also folds non-ASCII letters. */
function searchKey(input: string): Document {
  return { $reduce: { input: { $range: [0, { $strLenCP: input }] }, initialValue: '', in: {
    $let: { vars: { ch: { $substrCP: [input, '$$this', 1] } }, in: {
      $concat: ['$$value', { $let: { vars: { at: { $indexOfCP: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', '$$ch'] } },
        in: { $cond: [{ $gte: ['$$at', 0] }, { $substrCP: ['abcdefghijklmnopqrstuvwxyz', '$$at', 1] }, '$$ch'] } } }],
    } },
  } } };
}

export class MongoAggregateBackend implements AggregateBackend {
  private initialization?: Promise<void>;
  constructor(private client: MongoClient, private db: Db, private events: string,
    private referrer: () => Document, private channel: () => Document) {}

  async ensure(): Promise<void> {
    this.initialization ??= (async () => {
      try {
        const hello = await this.db.admin().command({ hello: 1, ...options });
        const info = await this.db.admin().command({ buildInfo: 1, ...options });
        const [major, minor] = String(info.version).split('.').map(Number);
        if (!hello.setName || !(major! > 5 || major === 5 && minor! >= 3)) throw unavailable();
        await this.db.collection(META).createIndex({ id: 1 }, { unique: true });
        await this.db.collection(META).createIndex({ siteId: 1, scopeHash: 1, state: 1 });
        await this.db.collection(META).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await this.db.collection(ROWS).createIndex({ snapshotId: 1, position: 1 }, { unique: true, collation: { locale: 'simple' } });
        await this.db.collection(ROWS).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        // Force creation before quota reservation enters a transaction.
        await this.db.collection(OWNERS).createIndex({ siteId: 1 }, { unique: true });
        await this.db.collection(this.events).aggregate([
          { $match: { $expr: { $eq: [1, 0] } } },
          { $setWindowFields: { sortBy: { timestamp: 1, _id: 1 }, output: { position: { $sum: 1, window: { documents: ['unbounded', 'current'] } } } } },
          { $project: { _id: 0, snapshotId: { $literal: 'capability-check' }, position: 1, expiresAt: { $literal: new Date(0) } } },
          { $merge: { into: ROWS, on: ['snapshotId', 'position'], whenMatched: 'fail', whenNotMatched: 'insert' } },
        ], { ...options, collation: { locale: 'simple' }, readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }).toArray();
      } catch { throw unavailable(); }
    })();
    try { await this.initialization; } catch (error) { this.initialization = undefined; throw error; }
  }

  async reserve(s: AggregateSnapshot): Promise<{ snapshot: AggregateSnapshot; owned: boolean }> {
    // Insert the per-site lock outside the transaction; duplicate races are benign.
    try { await this.db.collection(OWNERS).updateOne({ siteId: s.siteId }, { $setOnInsert: { siteId: s.siteId, revision: 0 } }, { upsert: true, ...options }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw unavailable(); }
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        await this.db.collection(OWNERS).updateOne({ siteId: s.siteId }, { $inc: { revision: 1 } }, { session, ...options });
        const now = new Date();
        const pending = await this.db.collection(META).findOne({ siteId: s.siteId, scopeHash: s.scopeHash,
          state: 'building', expiresAt: { $gt: now } }, { session, ...options });
        if (pending) return { snapshot: pending.metadata as AggregateSnapshot, owned: false };
        const count = await this.db.collection(META).countDocuments({ siteId: s.siteId, state: { $in: ['ready', 'building'] },
          expiresAt: { $gt: now } }, { session, ...options });
        if (count >= SNAPSHOT_QUOTA) throw capacity();
        await this.db.collection(META).insertOne({ id: s.id, siteId: s.siteId, scopeHash: s.scopeHash, state: 'building',
          createdAt: new Date(s.createdAt), expiresAt: new Date(s.expiresAt), metadata: s }, { session });
        return { snapshot: s, owned: true };
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: SNAPSHOT_BUILD_TIMEOUT });
      if (!result) throw unavailable();
      return result;
    } catch (error) { if (error instanceof AggregatePageError) throw error; throw unavailable(); }
    finally { await session.endSession(); }
  }

  async materialize(s: AggregateSnapshot, q: NormalizedPageParams): Promise<{ rowCount: number; valueSum: number }> {
    const column = METRIC_COLUMNS[q.metric];
    const pageviews = q.metric === 'top_pages' || q.metric === 'top_referrers';
    const clauses: Document[] = [{ site_id: q.siteId }, { timestamp: { $gte: new Date(s.from), $lte: new Date(s.to) } },
      { [column]: { $ne: null } }];
    if (!q.includeBots) clauses.push({ bot_flag: null });
    if (pageviews) clauses.push({ type: 'pageview' });
    if (q.metric === 'top_referrers') clauses.push({ referrer: { $ne: '' } });
    for (const [name, value] of Object.entries(q.filters)) {
      if (name === 'referrer' || name === 'channel') clauses.push({ $expr: { $eq: [name === 'referrer' ? this.referrer() : this.channel(), { $literal: value }] } });
      else clauses.push({ [FILTER_COLUMNS[name]!]: value });
    }
    const pipeline: Document[] = [{ $match: { $and: clauses } },
      { $set: { _key: q.metric === 'top_referrers' ? this.referrer() : `$${column}` } }];
    if (q.metric === 'top_referrers') pipeline.push({ $match: { _key: { $ne: '' } } });
    if (pageviews) pipeline.push({ $group: { _id: '$_key', value: { $sum: 1 } } });
    else pipeline.push({ $group: { _id: { key: '$_key', visitor: '$visitor_id' } } },
      { $group: { _id: '$_id.key', value: { $sum: 1 } } });
    pipeline.push({ $set: { key: '$_id', searchKey: searchKey('$_id') } });
    const eligible: Document[] = [{ value: { $gte: q.minCount } }];
    if (q.search) eligible.push({ $expr: { $gte: [{ $indexOfCP: ['$searchKey', { $literal: q.search }] }, 0] } });
    if (q.keys !== undefined) eligible.push({ key: { $in: q.keys } });
    pipeline.push({ $match: { $and: eligible } }, { $sort: { value: -1, key: 1 } }, { $limit: SNAPSHOT_ROW_CAP + 1 },
      // $documentNumber accepts only one sort field. A cumulative document
      // count supports the stable compound value DESC / bytewise key ASC sort.
      { $setWindowFields: { sortBy: { value: -1, key: 1 }, output: { position: { $sum: 1, window: { documents: ['unbounded', 'current'] } } } } },
      { $project: { _id: 0, key: 1, searchKey: 1, value: 1, position: 1,
        snapshotId: { $literal: s.id }, expiresAt: { $literal: new Date(s.expiresAt) } } },
      { $merge: { into: ROWS, on: ['snapshotId', 'position'], whenMatched: 'fail', whenNotMatched: 'insert' } });
    try {
      await this.db.collection(this.events).aggregate(pipeline, { ...options, allowDiskUse: true,
        collation: { locale: 'simple' }, readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }).toArray();
      const [totals] = await this.db.collection(ROWS).aggregate([{ $match: { snapshotId: s.id } },
        { $group: { _id: null, rowCount: { $sum: 1 }, valueSum: { $sum: '$value' } } }], options).toArray();
      const rowCount = safeCount(totals?.rowCount ?? 0), valueSum = safeCount(totals?.valueSum ?? 0);
      if (rowCount > SNAPSHOT_ROW_CAP) throw capacity();
      return { rowCount, valueSum };
    } catch (error) { if (error instanceof AggregatePageError) throw error; throw unavailable(); }
  }

  async publish(s: AggregateSnapshot): Promise<void> {
    const result = await this.db.collection(META).updateOne({ id: s.id, state: 'building', expiresAt: { $gt: new Date() } },
      { $set: { state: 'ready', metadata: s } }, { ...options, writeConcern: { w: 'majority' } });
    if (result.modifiedCount !== 1) throw new AggregatePageError('snapshot_expired', 409);
  }
  async fail(s: AggregateSnapshot): Promise<void> {
    await this.db.collection(META).deleteOne({ id: s.id }, options);
    await this.db.collection(ROWS).deleteMany({ snapshotId: s.id }, options);
  }
  async get(id: string): Promise<AggregateSnapshot | null> {
    const doc = await this.db.collection(META).findOne({ id }, options);
    return doc?.metadata ?? null;
  }
  async rows(id: string, boundary: number, direction: 'forward' | 'back', limit: number): Promise<AggregateRow[]> {
    const docs = await this.db.collection(ROWS).find({ snapshotId: id, position: { [direction === 'back' ? '$lt' : '$gt']: boundary } }, options)
      .sort({ position: direction === 'back' ? -1 : 1 }).limit(limit).toArray();
    return docs.map((row) => ({ position: safeCount(row.position), key: row.key, value: safeCount(row.value) }));
  }
  async cleanup(now: number, siteId: string): Promise<void> {
    const expired = { siteId, $or: [{ expiresAt: { $lte: new Date(now) } }, { state: 'failed' },
      { state: 'building', createdAt: { $lte: new Date(now - SNAPSHOT_BUILD_TIMEOUT) } }] };
    // At most the site's 32 quota records; no grouped/source relation enters Node.
    const ids = (await this.db.collection(META).find(expired, { ...options, projection: { id: 1 } }).limit(SNAPSHOT_QUOTA).toArray()).map((row) => row.id);
    await this.db.collection(META).deleteMany(expired, options);
    await this.db.collection(ROWS).deleteMany({ $or: [{ expiresAt: { $lte: new Date(now) } }, { snapshotId: { $in: ids } }] }, options);
  }
}
