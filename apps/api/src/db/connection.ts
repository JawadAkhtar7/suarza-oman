/**
 * The one Mongoose connection, and the indexes it guarantees.
 *
 * Index creation is deliberate and explicit rather than left to Mongoose's
 * autoIndex: on a live database an index that only exists because a model file
 * mentioned it is an index nobody knows the cost of.
 */

import mongoose from 'mongoose';

export async function connect(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  // Fail fast: a wrong URI or a paused cluster should say so at boot.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}

export function describeConnection(): string {
  const { host, name } = mongoose.connection;
  return `${host ?? 'unknown host'}/${name ?? 'unknown db'}`;
}
