/**
 * The whole API, with a throwaway database and sample data.
 *
 * `pnpm demo` — for showing the app to somebody, for a fresh clone before the
 * Atlas connection string exists, and for looking at a screen with realistic
 * data in it. Nothing here touches a real cluster: the database lives in a temp
 * directory and dies with the process.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { CustomerModel, syncCustomerIndexes } from '../models/customer.model.js';
import { LedgerEntryModel, syncLedgerIndexes } from '../models/ledger-entry.model.js';

const SAMPLE = [
  ['Ahmed Al Balushi', 'Al Balushi Trading LLC', 'ahmed@albalushi.om', '+968 9123 4567', 'OM1100234871'],
  ['Fatma Al Harthy', 'Harthy Stores', 'fatma@harthystores.om', '+968 9245 8890', 'OM1100781234'],
  ['Said Al Mamari', 'Mamari Contracting', 'accounts@mamari.om', '+968 9911 2244', 'OM1100556677'],
  ['Zahra Al Riyami', 'Riyami Foodstuff', 'zahra@riyamifoods.om', '+968 9772 3311', ''],
  ['Khalid Al Lawati', 'Lawati Electricals', 'khalid@lawati.om', '+968 9330 7788', 'OM1100990011'],
  ['Mariam Al Hinai', '', 'mariam.hinai@gmail.com', '+968 9455 6677', ''],
  ['Yousuf Al Saadi', 'Saadi Auto Spares', '', '+968 9123 9090', 'OM1100334455'],
  ['Noura Al Kindi', 'Kindi Interiors', 'noura@kindiinteriors.om', '+968 9866 1200', ''],
  ['Hamed Al Zadjali', 'Zadjali Logistics', 'ops@zadjali.om', '+968 9501 4477', 'OM1100112233'],
  ['Salim Al Rawahi', 'Rawahi Cement Supplies', 'salim@rawahicement.om', '+968 9677 8899', 'OM1100447788'],
  ['Amal Al Busaidi', 'Busaidi Pharmacy', 'amal@busaidipharma.om', '+968 9233 5566', ''],
  ['Ibrahim Al Abri', 'Abri Marine', 'ibrahim@abrimarine.om', '+968 9788 3322', 'OM1100665544'],
] as const;

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'suarza_oman_demo' });
  await syncCustomerIndexes();
  await syncLedgerIndexes();

  await CustomerModel.deleteMany({});

  /*
   * Written through the driver rather than the model: the sample needs
   * `created_at` spread over the last fortnight so the "Added" column and the
   * newest-first sort have something to show, and Mongoose's timestamps
   * overwrite whatever a create or update passes for that field. Fixed sample
   * data, so nothing is lost by skipping schema validation here.
   */
  await CustomerModel.collection.insertMany(
    SAMPLE.map(([name, company, email, phone, vat_number], index) => {
      const at = new Date(Date.now() - index * 36 * 60 * 60 * 1000);
      return {
        name,
        company,
        email,
        phone,
        vat_number,
        notes: '',
        // A couple of inactive ones, so the status filter has something to do.
        status: index % 7 === 5 ? 'INACTIVE' : 'ACTIVE',
        created_at: at,
        updated_at: at,
      };
    }),
  );

  /*
   * A ledger for the first few: one customer owing, one paid ahead, one square,
   * and one with a voided entry — the four states the screens have to show.
   */
  const seeded = await CustomerModel.find().sort({ _id: 1 }).limit(6).select('_id name');
  const day = (back: number) => new Date(Date.now() - back * 24 * 60 * 60 * 1000);
  const entries: Record<string, unknown>[] = [];
  const at = (customerIndex: number, rows: [string, string, number, string, number][]) => {
    const customer = seeded[customerIndex];
    if (!customer) return;
    for (const [kind, direction, amount_baisa, description, daysAgo] of rows) {
      entries.push({
        customer_id: customer._id,
        kind,
        direction,
        amount_baisa,
        description,
        reference: kind === 'PAYMENT' ? `CHQ-${4000 + entries.length}` : `INV-${100 + entries.length}`,
        entry_date: day(daysAgo),
        voided_at: null,
        void_reason: null,
        created_at: day(daysAgo),
        updated_at: day(daysAgo),
      });
    }
  };

  at(0, [
    ['OPENING', 'DEBIT', 250_000, 'Balance brought forward', 40],
    ['CHARGE', 'DEBIT', 480_500, 'Cement delivery — 20 tonne', 24],
    ['PAYMENT', 'CREDIT', 500_000, 'Cheque received', 12],
    ['CHARGE', 'DEBIT', 132_750, 'Site clearance', 5],
  ]);
  at(1, [
    ['CHARGE', 'DEBIT', 96_000, 'Monthly supply — August', 30],
    ['PAYMENT', 'CREDIT', 96_000, 'Bank transfer', 21],
  ]);
  at(2, [['PAYMENT', 'CREDIT', 75_000, 'Advance against next order', 9]]);
  at(3, [
    ['CHARGE', 'DEBIT', 1_250_000, 'Steel — 12 tonne', 18],
    ['PAYMENT', 'CREDIT', 400_000, 'Part payment', 7],
    ['ADJUSTMENT', 'CREDIT', 12_500, 'Agreed discount on damaged stock', 6],
  ]);

  await LedgerEntryModel.collection.insertMany(entries);

  /* One voided entry, so the statement shows what a corrected mistake looks like. */
  const mistake = await LedgerEntryModel.findOne({ description: 'Site clearance' });
  if (mistake) {
    await LedgerEntryModel.collection.insertOne({
      customer_id: mistake.customer_id,
      kind: 'CHARGE',
      direction: 'DEBIT',
      amount_baisa: 1_327_500,
      description: 'Site clearance (duplicate)',
      reference: 'INV-104',
      entry_date: day(5),
      voided_at: day(4),
      void_reason: 'Entered twice — decimal in the wrong place',
      created_at: day(5),
      updated_at: day(4),
    });
  }

  const port = Number(process.env['PORT'] ?? 4100);
  const serveWeb = process.env['SERVE_WEB'] === 'true';
  createApp({ serveWeb }).listen(port, () => {
    console.log(
      `[demo] API on http://127.0.0.1:${port} — ${SAMPLE.length} customers, ${entries.length + 1} ledger entries`,
    );
    console.log('[demo] in-memory database; everything is lost when this stops');
  });

  const stop = async () => {
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
