/**
 * What is actually in the database — `pnpm db:status`.
 *
 * Reads nothing but metadata and counts, so it is safe to run against
 * production. Answers the three questions worth asking after a deploy or a
 * config change: am I pointed at the right database, did the indexes the
 * queries rely on get created, and how much is in here.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { loadConfig } from '../config.js';
import { CustomerModel } from '../models/customer.model.js';

async function main(): Promise<void> {
  const config = loadConfig();
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15_000 });

  const connection = mongoose.connection;
  console.log(`database : ${connection.name}`);
  console.log(`host     : ${connection.host}`);

  const collections = await connection.db!.listCollections().toArray();
  console.log(`collections: ${collections.map((c) => c.name).join(', ') || '(none yet)'}`);

  console.log(`\ncustomers: ${await CustomerModel.countDocuments()} documents`);
  const indexes = await CustomerModel.collection.indexes().catch(() => []);
  for (const index of indexes) {
    console.log(`  index ${index.name} ${JSON.stringify(index.key)}`);
  }

  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
