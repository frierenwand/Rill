import type { WorkerJob } from './storage/worker-jobs';

export interface Env {
  DB?: D1Database;
  RILL_SECRET?: string;
  TMDB_KEY?: string;
  D1_QUERY_BUDGET?: string;
  RILL_UPDATE_HOOK?: string;
  RILL_JOBS?: Queue<WorkerJob>;
}
