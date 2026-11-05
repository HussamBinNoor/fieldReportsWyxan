import { createApp } from './app';
import { ensureConfigDirectories, loadConfig } from './config/env';
import { openDatabase } from './database/db';

const config = loadConfig();
ensureConfigDirectories(config);
const db = openDatabase(config.dbPath);
const app = createApp({ config, db });

app.listen(config.port, config.host, () => {
  console.log(`Field Reports API listening on http://${config.host}:${config.port}`);
});
