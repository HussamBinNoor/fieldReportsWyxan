import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { openDatabase } from '../src/database/db';
import { MAX_IMAGE_BYTES } from '../src/config/env';

const REPORT_A = '11111111-1111-4111-8111-111111111111';
const REPORT_B = '22222222-2222-4222-8222-222222222222';
const IMAGE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IMAGE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function jpeg(size: number): Buffer {
  const buffer = Buffer.alloc(size, 0x22);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'field-reports-'));
const config = loadConfig({
  ...process.env,
  NODE_ENV: 'development',
  DB_PATH: path.join(root, 'test.db'),
  UPLOAD_DIR: path.join(root, 'uploads'),
  TEMP_DIR: path.join(root, 'tmp'),
  DATA_ROOT: root,
});
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.tempDir, { recursive: true });
const db = openDatabase(config.dbPath);
const app = createApp({ config, db });

before(() => {
  assert.ok(app);
});

after(() => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('report API', { concurrency: 1 }, () => {
test('rejects a photo larger than 5 MB', async () => {
  const body = jpeg(MAX_IMAGE_BYTES + 1);
  const response = await request(app)
    .post(`/api/reports/${REPORT_A}/images/${IMAGE_A}`)
    .field('checksum', sha256(body))
    .attach('file', body, 'large.jpg');
  assert.equal(response.status, 413);
  assert.equal(response.body.error, 'IMAGE_TOO_LARGE');
});

test('stores a photo once and serves the same bytes', async () => {
  const body = jpeg(128);
  const checksum = sha256(body);
  const first = await request(app)
    .post(`/api/reports/${REPORT_A}/images/${IMAGE_A}`)
    .field('checksum', checksum)
    .attach('file', body, 'wall.jpg');
  assert.equal(first.status, 201);
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.checksum, checksum);
  assert.equal(first.body.sizeBytes, 128);

  const second = await request(app)
    .post(`/api/reports/${REPORT_A}/images/${IMAGE_A}`)
    .field('checksum', checksum)
    .attach('file', body, 'wall.jpg');
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);

  const count = db.prepare('SELECT COUNT(*) AS total FROM images WHERE report_id = ?').get(REPORT_A) as {
    total: number;
  };
  assert.equal(count.total, 1);

  const file = await request(app).get(`/api/reports/${REPORT_A}/images/${IMAGE_A}/file`);
  assert.equal(file.status, 200);
  assert.equal(sha256(file.body), checksum);
  assert.ok(file.body.length <= MAX_IMAGE_BYTES);
});

test('does not list a report until every photo is finalized, and finalize is idempotent', async () => {
  const hidden = await request(app).get('/api/reports');
  assert.equal(hidden.body.reports.length, 0);

  const partial = await request(app).post(`/api/reports/${REPORT_A}/finalize`).send({
    description: 'Crack along the north wall',
    idempotencyKey: REPORT_A,
    imageIds: [IMAGE_A, IMAGE_B],
  });
  assert.equal(partial.status, 409);
  assert.equal(partial.body.error, 'INCOMPLETE_IMAGES');

  const secondPhoto = jpeg(64);
  const uploaded = await request(app)
    .post(`/api/reports/${REPORT_A}/images/${IMAGE_B}`)
    .field('checksum', sha256(secondPhoto))
    .attach('file', secondPhoto, 'detail.jpg');
  assert.equal(uploaded.status, 201);

  const finalized = await request(app).post(`/api/reports/${REPORT_A}/finalize`).send({
    description: 'Crack along the north wall',
    idempotencyKey: REPORT_A,
    imageIds: [IMAGE_A, IMAGE_B],
  });
  assert.equal(finalized.status, 200);
  assert.equal(finalized.body.status, 'complete');
  assert.equal(finalized.body.images.length, 2);

  const again = await request(app).post(`/api/reports/${REPORT_A}/finalize`).send({
    description: 'A different description should not create a second report',
    idempotencyKey: REPORT_A,
    imageIds: [IMAGE_A, IMAGE_B],
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.description, 'Crack along the north wall');

  const reports = db.prepare('SELECT COUNT(*) AS total FROM reports').get() as { total: number };
  assert.equal(reports.total, 1);

  const list = await request(app).get('/api/reports');
  assert.equal(list.body.reports.length, 1);
  assert.equal(list.body.reports[0].id, REPORT_A);

  const other = jpeg(40);
  await request(app)
    .post(`/api/reports/${REPORT_B}/images/${IMAGE_A}`)
    .field('checksum', sha256(other))
    .attach('file', other, 'other.jpg');
  const stillOne = await request(app).get('/api/reports');
  assert.equal(stillOne.body.reports.length, 1);

  const overview = await request(app).get('/api/reports/summary');
  assert.equal(overview.body.completedReports, 1);
  assert.equal(overview.body.images, 2);
  assert.equal(overview.body.allImagesWithinLimit, true);
});

test('rejects a mismatched checksum and an invalid id', async () => {
  const body = jpeg(20);
  const mismatch = await request(app)
    .post(`/api/reports/${REPORT_B}/images/${IMAGE_B}`)
    .field('checksum', 'f'.repeat(64))
    .attach('file', body, 'bad.jpg');
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error, 'CHECKSUM_MISMATCH');

  const badId = await request(app).get('/api/reports/not-a-uuid');
  assert.equal(badId.status, 400);
});
});
