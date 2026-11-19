\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE edu_versions (
    build_id text PRIMARY KEY,
    source_id text NOT NULL,
    request_seq integer NOT NULL CHECK (request_seq > 0),
    revision text NOT NULL,
    config_fingerprint text NOT NULL,
    ready boolean NOT NULL DEFAULT false,
    UNIQUE (source_id, request_seq),
    UNIQUE (source_id, build_id)
) ON COMMIT DROP;

CREATE TEMP TABLE edu_sources (
    source_id text PRIMARY KEY,
    latest_request_seq integer NOT NULL CHECK (latest_request_seq > 0),
    active_build_id text,
    FOREIGN KEY (source_id, active_build_id) REFERENCES edu_versions (source_id, build_id)
) ON COMMIT DROP;

INSERT INTO edu_versions (build_id, source_id, request_seq, revision, config_fingerprint, ready)
VALUES ('b1', 'fractions-handout', 1, 'hash-v1', 'config-a', true);
INSERT INTO edu_sources (source_id, latest_request_seq, active_build_id)
VALUES ('fractions-handout', 1, 'b1');

\echo 'Step 1: same revision + same configuration returns b1'
SELECT v.build_id
FROM edu_sources AS s
JOIN edu_versions AS v ON v.source_id = s.source_id AND v.request_seq = s.latest_request_seq
WHERE s.source_id = 'fractions-handout' AND v.revision = 'hash-v1'
  AND v.config_fingerprint = 'config-a';

\echo 'Step 2: register b2, then observe that b1 is still active'
UPDATE edu_sources SET latest_request_seq = 2 WHERE source_id = 'fractions-handout';
INSERT INTO edu_versions (build_id, source_id, request_seq, revision, config_fingerprint)
VALUES ('b2', 'fractions-handout', 2, 'hash-v2', 'config-a');
SELECT source_id, latest_request_seq, active_build_id FROM edu_sources;

\echo 'Step 3: publish b2 only after the rows have been verified in Milvus'
UPDATE edu_versions SET ready = true WHERE build_id = 'b2';
UPDATE edu_sources AS s
SET active_build_id = v.build_id
FROM edu_versions AS v
WHERE s.source_id = 'fractions-handout' AND v.source_id = s.source_id
  AND v.build_id = 'b2' AND v.ready AND v.request_seq = s.latest_request_seq
RETURNING s.active_build_id;

\echo 'Step 4: b1 finishing late returns zero rows'
UPDATE edu_sources AS s
SET active_build_id = v.build_id
FROM edu_versions AS v
WHERE s.source_id = 'fractions-handout' AND v.source_id = s.source_id
  AND v.build_id = 'b1' AND v.ready AND v.request_seq = s.latest_request_seq
RETURNING s.active_build_id;

\echo 'Step 5: authorized rollback to b1 invalidates in-flight publish requests'
UPDATE edu_sources
SET active_build_id = 'b1', latest_request_seq = latest_request_seq + 1
WHERE source_id = 'fractions-handout'
RETURNING active_build_id, latest_request_seq;

\echo 'Step 6: unpublish; a new student request has no eligible build'
UPDATE edu_sources
SET active_build_id = NULL, latest_request_seq = latest_request_seq + 1
WHERE source_id = 'fractions-handout'
RETURNING active_build_id, latest_request_seq;

ROLLBACK;
