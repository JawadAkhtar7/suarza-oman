/**
 * A real MongoDB, in memory.
 *
 * The queries this API relies on — regex search, collation, paging — behave
 * differently in a fake, and a test that passes against a stub is worth very
 * little. mongodb-memory-server runs an actual mongod, so nothing here ever
 * touches Atlas.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { CustomerModel, syncCustomerIndexes } from '../src/models/customer.model.js';

let mongod: MongoMemoryServer | undefined;

export async function startTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'suarza_oman_test' });
  await syncCustomerIndexes();
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
}

/** Between tests, so one test's customers never explain another's assertion. */
export async function clearDb(): Promise<void> {
  await CustomerModel.deleteMany({});
}

export const app = createApp();

export function customerInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ahmed Al Balushi',
    company: 'Al Balushi Trading',
    email: 'ahmed@albalushi.om',
    phone: '+968 9123 4567',
    ...overrides,
  };
}
