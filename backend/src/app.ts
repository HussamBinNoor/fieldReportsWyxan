import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { Database } from 'better-sqlite3';
import { MAX_IMAGE_BYTES, type AppConfig } from './config/env';
import {
  finalizeReport,
  getReport,
  imageFile,
  listCompleted,
  storeImage,
  summary,
} from './services/reports';
import { consumeSimulation, getSimulation, replaceSimulation, resetSimulation } from './services/simulation';
import { assertUuid } from './utils/files';
import { HttpError } from './utils/httpError';

type AppOptions = {
  config: AppConfig;
  db: Database;
};

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function createApp({ config, db }: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        callback(null, config.tempDir);
      },
      filename: (_req, _file, callback) => {
        callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}.upload`);
      },
    }),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  });

  if (config.nodeEnv !== 'production') {
    app.use((req, res, next) => {
      consumeSimulation(req, res)
        .then(result => {
          if (result === 'continue') {
            next();
          }
        })
        .catch(next);
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'field-reports' });
  });

  app.get('/api/reports/summary', (_req, res) => {
    res.json(summary(db));
  });

  app.get('/api/reports', (_req, res) => {
    res.json({ reports: listCompleted(db) });
  });

  app.get(
    '/api/reports/:reportId/images/:imageId/file',
    asyncRoute(async (req, res) => {
      const reportId = readId(req.params.reportId);
      const imageId = readId(req.params.imageId);
      const file = imageFile(db, config.uploadDir, reportId, imageId);
      if (!fs.existsSync(file.filePath)) {
        throw new HttpError(404, 'NOT_FOUND', 'That photo file is missing on the server.');
      }
      res.type(file.mimeType);
      res.sendFile(path.resolve(file.filePath));
    }),
  );

  app.post(
    '/api/reports/:reportId/images/:imageId',
    upload.single('file'),
    asyncRoute(async (req, res) => {
      const reportId = readId(req.params.reportId);
      const imageId = readId(req.params.imageId);
      if (!req.file) {
        throw new HttpError(400, 'FILE_REQUIRED', 'Choose a photo to upload.');
      }
      const claimedChecksum = typeof req.body?.checksum === 'string' ? req.body.checksum : '';
      try {
        const stored = await storeImage({
          db,
          uploadDir: config.uploadDir,
          reportId,
          imageId,
          tempPath: req.file.path,
          claimedChecksum,
        });
        res.status(stored.duplicate ? 200 : 201).json({
          reportId,
          imageId: stored.report.images.find(image => image.id === imageId)?.id ?? imageId,
          checksum: stored.report.images.find(image => image.id === imageId)?.checksum,
          sizeBytes: stored.report.images.find(image => image.id === imageId)?.sizeBytes,
          duplicate: stored.duplicate,
        });
      } catch (error) {
        await fs.promises.unlink(req.file.path).catch(() => undefined);
        throw error;
      }
    }),
  );

  app.post(
    '/api/reports/:reportId/finalize',
    asyncRoute(async (req, res) => {
      const reportId = readId(req.params.reportId);
      const description = typeof req.body?.description === 'string' ? req.body.description : '';
      const idempotencyKey =
        typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : '';
      const imageIds = Array.isArray(req.body?.imageIds)
        ? req.body.imageIds.filter((id: unknown): id is string => typeof id === 'string').map(readId)
        : [];
      const report = finalizeReport({ db, reportId, description, imageIds, idempotencyKey });
      res.json(report);
    }),
  );

  app.get(
    '/api/reports/:reportId',
    asyncRoute(async (req, res) => {
      const report = getReport(db, readId(req.params.reportId));
      if (!report) {
        throw new HttpError(404, 'NOT_FOUND', 'That report is not on the server.');
      }
      res.json(report);
    }),
  );

  if (config.nodeEnv !== 'production') {
    app.get('/api/dev/simulation', (_req, res) => {
      res.json(getSimulation());
    });
    app.post('/api/dev/simulation', (req, res) => {
      res.json(replaceSimulation(req.body ?? {}));
    });
    app.post('/api/dev/simulation/reset', (_req, res) => {
      res.json(resetSimulation());
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: 'IMAGE_TOO_LARGE',
        message: 'Images must be 5000000 bytes or smaller.',
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        ...error.extra,
      });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_ID') {
      res.status(400).json({ error: 'INVALID_ID', message: 'The report or photo id is not valid.' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'INTERNAL', message: 'The server could not finish that request.' });
  });

  return app;
}

function readId(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    throw new HttpError(400, 'INVALID_ID', 'The report or photo id is not valid.');
  }
  try {
    return assertUuid(raw);
  } catch {
    throw new HttpError(400, 'INVALID_ID', 'The report or photo id is not valid.');
  }
}
