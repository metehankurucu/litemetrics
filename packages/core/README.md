# @litemetrics/core

Shared types, interfaces, and constants for the Litemetrics analytics SDK.

## Installation

```bash
npm install @litemetrics/core
```

## Usage

This package is used internally by other Litemetrics packages. You typically don't need to install it directly.

```ts
import type {
  TrackerConfig,
  CollectorConfig,
  EnrichedEvent,
  Site,
  QueryParams,
  QueryResult,
  DBAdapter,
} from '@litemetrics/core';

import { DEFAULT_BATCH_SIZE, DEFAULT_FLUSH_INTERVAL } from '@litemetrics/core';
```

## What's Included

- **Event Types** - `PageviewEvent`, `CustomEvent`, `IdentifyEvent`, `EnrichedEvent`
- **Config Types** - `TrackerConfig`, `CollectorConfig`, `DBConfig`, `CORSConfig`
- **Query Types** - `QueryParams`, `QueryResult`, `TimeSeriesParams`, `RetentionParams`
- **Site Types** - `Site`, `CreateSiteRequest`, `UpdateSiteRequest`
- **DB Adapter Interface** - `DBAdapter` for building custom database adapters
- **Constants** - Default batch sizes, flush intervals, session timeouts, storage keys

## License

MIT
