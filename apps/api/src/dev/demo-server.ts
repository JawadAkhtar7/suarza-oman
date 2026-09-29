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

  await seedTrading(port);

  const stop = async () => {
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

/**
 * Products, staff, sales and purchases — seeded through the running API rather
 * than written straight into the collections.
 *
 * That way the demo exercises the real code path: documents get their numbers
 * from the counter, stock moves, and the ledger is posted exactly as it would
 * be for a real sale. Data faked at the database level would look right and
 * behave differently.
 */
async function seedTrading(port: number): Promise<void> {
  const base = `http://127.0.0.1:${port}/api`;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.json() as Promise<Record<string, { id: string }>>;
  };

  const PRODUCTS = [
    ['Cement 50kg bag', 'CEM50', 'Building materials', 'BAG', 2_100, 2_600, 400],
    ['Steel bar 12mm', 'STL12', 'Building materials', 'PIECE', 3_400, 4_200, 260],
    ['Sand (per tonne)', 'SND01', 'Building materials', 'TONNE', 4_000, 5_500, 80],
    ['Aggregate 20mm', 'AGG20', 'Building materials', 'TONNE', 3_800, 5_200, 60],
    ['Paint — white 20L', 'PNT20', 'Finishing', 'BOX', 12_500, 16_000, 45],
    ['Floor tile 60x60', 'TIL60', 'Finishing', 'BOX', 5_600, 7_400, 120],
    ['Rice 25kg', 'RIC25', 'Foodstuff', 'BAG', 7_200, 8_900, 90],
    ['Sugar 50kg', 'SUG50', 'Foodstuff', 'BAG', 9_100, 11_000, 40],
    ['Bottled water 24x500ml', 'WTR24', 'Foodstuff', 'CARTON', 800, 1_200, 300],
    ['Delivery within Muscat', 'DEL01', 'Services', 'PIECE', 0, 5_000, 0],
  ] as const;

  const products: { id: string; sale: number; unit: string; name: string }[] = [];
  for (const [name, code, category, unit, cost, sale, stock] of PRODUCTS) {
    const created = await post('/products', {
      name,
      code,
      category,
      unit,
      cost_price_baisa: cost,
      sale_price_baisa: sale,
      track_stock: code !== 'DEL01',
      reorder_level_milli: stock > 0 ? Math.round(stock * 1000 * 0.15) : 0,
      opening_stock_milli: stock * 1000,
    });
    products.push({ id: created['product']!.id, sale, unit, name });
  }

  const STAFF = [
    ['Salim Al Hinai', 'E001', 'Driver', 'Logistics', 320_000, '2023-02-01'],
    ['Maryam Al Balushi', 'E002', 'Accountant', 'Finance', 650_000, '2022-08-15'],
    ['Yousuf Al Amri', 'E003', 'Storekeeper', 'Warehouse', 380_000, '2024-01-10'],
    ['Fatma Al Harthy', 'E004', 'Sales executive', 'Sales', 550_000, '2023-11-05'],
    ['Khalid Al Lawati', 'E005', 'Driver', 'Logistics', 320_000, '2025-03-20'],
    ['Aisha Al Kindi', 'E006', 'Office administrator', 'Admin', 450_000, '2024-06-01'],
    ['Rashid Al Saadi', 'E007', 'Warehouse hand', 'Warehouse', 12_000, '2025-09-12'],
  ] as const;

  for (const [name, code, designation, department, salary, joined] of STAFF) {
    await post('/employees', {
      name,
      code,
      designation,
      department,
      phone: `+968 9${Math.floor(1000000 + Math.random() * 8999999)}`,
      salary_baisa: salary,
      pay_frequency: code === 'E007' ? 'DAILY' : 'MONTHLY',
      joined_on: joined,
      nationality: 'Omani',
    });
  }

  /* Customers are already seeded above; the first few double as suppliers. */
  const customers = (await (await fetch(`${base}/customers?page_size=100`)).json()) as {
    rows?: { id: string; name: string }[];
  };
  const parties = customers.rows ?? [];
  if (parties.length === 0) return;

  const suppliers = parties.slice(0, 3);
  for (const supplier of suppliers) {
    await fetch(`${base}/customers/${supplier.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_vendor: true }),
    });
  }

  const dayAgo = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

  /* Purchases first, so there is stock to sell. */
  for (let i = 0; i < 12; i++) {
    const supplier = pick(suppliers);
    const lineCount = 1 + Math.floor(Math.random() * 2);
    await post('/documents', {
      kind: 'PURCHASE',
      party_id: supplier.id,
      document_date: dayAgo(55 - i * 4),
      reference: `SI-${4000 + i}`,
      settlement: i % 3 === 0 ? 'PAID' : 'ON_ACCOUNT',
      lines: Array.from({ length: lineCount }, () => {
        const product = pick(products.filter((p) => p.name !== 'Delivery within Muscat'));
        return {
          product_id: product.id,
          description: product.name,
          unit: product.unit,
          quantity_milli: (10 + Math.floor(Math.random() * 40)) * 1000,
          unit_price_baisa: Math.round(product.sale * 0.78),
          vat_rate_percent: 5,
        };
      }),
    });
  }

  for (let i = 0; i < 34; i++) {
    const customer = pick(parties);
    const lineCount = 1 + Math.floor(Math.random() * 3);
    await post('/documents', {
      kind: 'SALE',
      party_id: customer.id,
      document_date: dayAgo(Math.floor(Math.random() * 45)),
      settlement: i % 3 === 0 ? 'ON_ACCOUNT' : 'PAID',
      lines: Array.from({ length: lineCount }, () => {
        const product = pick(products);
        return {
          product_id: product.id,
          description: product.name,
          unit: product.unit,
          quantity_milli: (1 + Math.floor(Math.random() * 12)) * 1000,
          unit_price_baisa: product.sale,
          vat_rate_percent: product.name === 'Delivery within Muscat' ? 5 : 5,
        };
      }),
    });
  }

  console.log(`[demo] seeded ${PRODUCTS.length} products, ${STAFF.length} staff, 12 purchases, 34 sales`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
