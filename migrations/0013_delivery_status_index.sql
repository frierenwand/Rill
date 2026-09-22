CREATE INDEX IF NOT EXISTS deliveries_open ON deliveries(scope, status, service, created);
DROP INDEX IF EXISTS deliveries_order;
