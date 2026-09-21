CREATE TABLE watch_revisions (scope TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TRIGGER history_revision_insert AFTER INSERT ON history BEGIN
  INSERT INTO watch_revisions VALUES(NEW.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER history_revision_update AFTER UPDATE ON history BEGIN
  INSERT INTO watch_revisions VALUES(NEW.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER history_revision_delete AFTER DELETE ON history BEGIN
  INSERT INTO watch_revisions VALUES(OLD.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER dropped_revision_insert AFTER INSERT ON dropped_shows BEGIN
  INSERT INTO watch_revisions VALUES(NEW.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER dropped_revision_update AFTER UPDATE ON dropped_shows BEGIN
  INSERT INTO watch_revisions VALUES(NEW.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER dropped_revision_delete AFTER DELETE ON dropped_shows BEGIN
  INSERT INTO watch_revisions VALUES(OLD.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER ratings_revision_insert AFTER INSERT ON item_ratings BEGIN
  INSERT INTO watch_revisions VALUES(NEW.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER ratings_revision_update AFTER UPDATE ON item_ratings BEGIN
  INSERT INTO watch_revisions VALUES(NEW.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER ratings_revision_delete AFTER DELETE ON item_ratings BEGIN
  INSERT INTO watch_revisions VALUES(OLD.scope,1) ON CONFLICT(scope) DO UPDATE SET version=version+1;
END;
