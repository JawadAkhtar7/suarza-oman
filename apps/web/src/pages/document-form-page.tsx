/**
 * Writing a sales invoice, a sales return, a purchase or a purchase return.
 *
 * Laid out the way the client's own bill book is: the header across the top,
 * then a product line that is filled in and added, then the money at the
 * bottom. That add-then-list shape matters — somebody entering ten lines from
 * a delivery note wants to type a line, press Add, and be back at the product
 * box, not to hunt for the next empty row in a grid.
 *
 * All four share this screen because they are the same form with the same
 * arithmetic: a party, some priced lines, and a paymode. What each one asks for
 * — whether it names a salesman, whether it takes a discount, whether it quotes
 * another invoice, and whether the party is a customer or a vendor — is
 * declared in FORM below rather than threaded through the markup.
 *
 * Everything priced here is priced again on the server. These figures exist so
 * the person saving is not surprised by the total; they are not what is stored.
 */

import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconCheck,
  IconPlus,
  IconPrinter,
  IconShoppingCart,
  IconTrash,
} from '@tabler/icons-react';
import {
  PAYMODE_LABELS,
  PRODUCT_UNIT_SHORT,
  SETTLEMENTS,
  documentTotals,
  formatOMR,
  formatQuantity,
  priceLine,
  toBaisa,
  toMilli,
  type DocumentKind,
  type Settlement,
} from '@suarza-oman/shared';
import { ApiError } from '../lib/api.js';
import { useCreateDocument, useNextDocumentNumber } from '../lib/documents.js';
import {
  usePartyOptions,
  useProductOptions,
  useSalesmanOptions,
} from '../components/documents/pickers.js';
import { DOCUMENT_UI } from '../components/documents/kind.js';

interface FormConfig {
  title: string;
  blurb: string;
  /** What this kind calls its own number: bill number, P number, PR number. */
  numberLabel: string;
  dateLabel: string;
  /** Purchases and their returns pick from the vendor list, not every customer. */
  vendorsOnly: boolean;
  /** Who sold it — a return is handled by whoever is at the counter. */
  showSalesman: boolean;
  /** A discount belongs to the sale; a return gives back what was charged. */
  showDiscount: boolean;
  /** Another invoice this one quotes, and what to call it. */
  againstInvoice: { placeholder: string; description: string } | null;
  saveLabel: string;
  savedTitle: string;
  creditHint: string;
  debitHint: string;
}

const FORM: Record<DocumentKind, FormConfig> = {
  SALE: {
    title: 'New sales invoice',
    blurb: 'When you save, the stock goes out and the amount is added to the customer’s account.',
    numberLabel: 'Bill number',
    dateLabel: 'Date',
    vendorsOnly: false,
    showSalesman: true,
    showDiscount: true,
    againstInvoice: null,
    saveLabel: 'Save invoice',
    savedTitle: 'Invoice saved',
    creditHint: 'Added to the customer’s account. They pay later.',
    debitHint: 'Paid now. The charge and the payment both show on their account.',
  },
  SALE_RETURN: {
    title: 'New sales return',
    blurb: 'When you save, the stock comes back in and the amount comes off the customer’s account.',
    numberLabel: 'Bill number',
    dateLabel: 'Date',
    vendorsOnly: false,
    showSalesman: false,
    showDiscount: false,
    againstInvoice: {
      placeholder: 'Bill no. of the original sale',
      description: 'The invoice these goods are coming back from',
    },
    saveLabel: 'Save return',
    savedTitle: 'Return saved',
    creditHint: 'Left on the customer’s account, against what they still have to pay.',
    debitHint: 'Money given back now. Both sides show on their account.',
  },
  PURCHASE: {
    title: 'New purchase invoice',
    blurb: 'When you save, the stock comes in and the amount is added to the vendor’s account.',
    numberLabel: 'P number',
    dateLabel: 'Inv date',
    vendorsOnly: true,
    showSalesman: true,
    showDiscount: false,
    againstInvoice: {
      placeholder: 'Vendor’s invoice no.',
      description: 'The number on the vendor’s invoice',
    },
    saveLabel: 'Save purchase',
    savedTitle: 'Purchase saved',
    creditHint: 'Added to the vendor’s account. You pay later.',
    debitHint: 'Paid now. The bill and the payment both show on their account.',
  },
  PURCHASE_RETURN: {
    title: 'New purchase return',
    blurb: 'When you save, the stock goes back out and the amount comes off the vendor’s account.',
    numberLabel: 'PR number',
    dateLabel: 'Date',
    vendorsOnly: true,
    showSalesman: false,
    showDiscount: false,
    againstInvoice: {
      placeholder: 'Vendor’s invoice no.',
      description: 'The vendor invoice these goods came from',
    },
    saveLabel: 'Save return',
    savedTitle: 'Return saved',
    creditHint: 'Left on the vendor’s account, against what you still have to pay.',
    debitHint: 'Money given back now. Both sides show on their account.',
  },
};

/** A product that has been added to the document. */
interface InvoiceItem {
  key: string;
  product_id: string;
  description: string;
  unit: string;
  quantity_milli: number;
  unit_price_baisa: number;
  vat_rate_percent: number;
}

/** The row being filled in, before Add moves it into the list. */
interface ItemDraft {
  product_id: string | null;
  description: string;
  unit: string;
  quantity: number | string;
  unit_price: number | string;
  vat_rate_percent: number;
}

const emptyDraft = (): ItemDraft => ({
  product_id: null,
  description: '',
  unit: '',
  quantity: 1,
  unit_price: '',
  vat_rate_percent: 5,
});

/**
 * Mantine treats an empty string as "nothing selected", so the deliberate
 * choice of nobody needs a value of its own to be distinguishable from not
 * having answered yet.
 */
const NO_SALESMAN = '__none__';

const num = (value: number | string): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface DocumentFormPageProps {
  kind: DocumentKind;
}

export function DocumentFormPage({ kind }: DocumentFormPageProps) {
  const navigate = useNavigate();
  const form = FORM[kind];
  const ui = DOCUMENT_UI[kind];
  const isWide = useMediaQuery('(min-width: 62em)', true);
  const productRef = useRef<HTMLInputElement>(null);

  const parties = usePartyOptions(form.vendorsOnly);
  const products = useProductOptions();
  const salesmen = useSalesmanOptions();
  const billNumber = useNextDocumentNumber(kind);
  const create = useCreateDocument();

  const [partyId, setPartyId] = useState<string | null>(null);
  const [salesmanId, setSalesmanId] = useState<string>(NO_SALESMAN);
  const [date, setDate] = useState<Date | null>(new Date());
  const [reference, setReference] = useState('');
  const [againstInvoice, setAgainstInvoice] = useState('');
  const [paymode, setPaymode] = useState<Settlement>('ON_ACCOUNT');
  const [discount, setDiscount] = useState<number | string>('');
  const [remarks, setRemarks] = useState('');

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft());
  const [itemError, setItemError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productOptions = useMemo(
    () =>
      (products.data?.rows ?? []).map((product) => ({
        value: product.id,
        label: product.code ? `${product.name} (${product.code})` : product.name,
      })),
    [products.data],
  );

  const salesmanOptions = useMemo(
    () => [{ value: NO_SALESMAN, label: 'Unavailable' }, ...(salesmen.data ?? [])],
    [salesmen.data],
  );

  const priced = items.map((item) => priceLine(item));
  const discountBaisa = form.showDiscount ? toBaisa(num(discount)) : 0;
  const totals = documentTotals(priced, discountBaisa);
  /* documentTotals caps the discount at the invoice; say so rather than
     silently showing a figure that is not the one they typed. Not while the
     invoice is still empty, though - everything is bigger than nothing. */
  const discountCapped = items.length > 0 && discountBaisa > totals.discount_baisa;

  const setDraftFields = (patch: Partial<ItemDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  /** Choosing a product fills the row in; every field below stays editable. */
  const chooseProduct = (productId: string | null) => {
    setItemError(null);
    const product = (products.data?.rows ?? []).find((row) => row.id === productId);
    if (!product) {
      setDraftFields({ product_id: null, description: '' });
      return;
    }
    setDraftFields({
      product_id: product.id,
      description: product.name,
      unit: PRODUCT_UNIT_SHORT[product.unit],
      unit_price: product.sale_price_baisa ? product.sale_price_baisa / 1000 : '',
      vat_rate_percent: product.vat_rate_percent,
    });
  };

  const addItem = () => {
    if (!draft.product_id || !draft.description.trim()) {
      setItemError('Choose a product first.');
      return;
    }
    if (num(draft.quantity) <= 0) {
      setItemError('Enter a quantity greater than zero.');
      return;
    }
    if (num(draft.unit_price) < 0) {
      setItemError('A price cannot be negative.');
      return;
    }

    setItems((current) => [
      ...current,
      {
        key: `${draft.product_id}-${Date.now()}-${current.length}`,
        product_id: draft.product_id ?? '',
        description: draft.description.trim(),
        unit: draft.unit.trim(),
        quantity_milli: toMilli(num(draft.quantity)),
        unit_price_baisa: toBaisa(num(draft.unit_price)),
        vat_rate_percent: draft.vat_rate_percent,
      },
    ]);
    setDraft(emptyDraft());
    setItemError(null);
    setError(null);
    productRef.current?.focus();
  };

  const removeItem = (key: string) =>
    setItems((current) => current.filter((item) => item.key !== key));

  /** `print` sends the saved document straight to the printer on arrival. */
  const save = async (print: boolean) => {
    setError(null);
    if (!partyId) {
      setError(`Choose the ${ui.partyLabel.toLowerCase()} this is for.`);
      return;
    }
    if (!date) {
      setError('Pick a date.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one product first.');
      return;
    }

    try {
      const { document } = await create.mutateAsync({
        kind,
        party_id: partyId,
        document_date: date,
        reference,
        against_invoice_number: form.againstInvoice ? againstInvoice : '',
        settlement: paymode,
        salesman_id: form.showSalesman && salesmanId !== NO_SALESMAN ? salesmanId : '',
        discount_baisa: discountBaisa,
        notes: remarks,
        lines: items.map((item) => ({
          product_id: item.product_id,
          description: item.description,
          unit: item.unit,
          quantity_milli: item.quantity_milli,
          unit_price_baisa: item.unit_price_baisa,
          vat_rate_percent: item.vat_rate_percent,
        })),
      });

      notifications.show({
        title: form.savedTitle,
        message: `Bill ${document.number} — ${formatOMR(document.total_baisa)}`,
        color: 'brand',
        icon: <IconCheck size={16} />,
      });
      navigate(`${ui.base}/${document.id}`, print ? { state: { print: true } } : undefined);
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : 'It could not be saved',
      );
    }
  };

  const itemRows = items.map((item, index) => ({ item, priced: priced[index] }));

  return (
    <Stack gap="lg">
      <Anchor component={Link} to={ui.base} fz="sm" c="dimmed">
        <Group gap={6}>
          <IconArrowLeft size={15} /> {ui.listTitle}
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Title order={1} fz={26}>
            {form.title}
          </Title>
          <Text c="dimmed" fz="sm" mt={4}>
            {form.blurb}
          </Text>
        </div>
        <Badge size="lg" variant="light" color="brand" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {ui.numberColumn} {billNumber.data ?? '—'}
        </Badge>
      </Group>

      {/* --- Header ---------------------------------------------------- */}
      <Card withBorder radius="lg" padding="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          <TextInput
            label={form.numberLabel}
            value={billNumber.data ?? ''}
            placeholder={billNumber.isLoading ? 'Loading…' : ''}
            description="Filled in for you when you save"
            readOnly
            styles={{ input: { fontVariantNumeric: 'tabular-nums' } }}
          />
          <TextInput
            label="Reference number"
            placeholder="LPO, delivery note, order no."
            value={reference}
            onChange={(event) => setReference(event.currentTarget.value)}
          />
          {form.againstInvoice && (
            <TextInput
              label="Invoice number"
              placeholder={form.againstInvoice.placeholder}
              description={form.againstInvoice.description}
              value={againstInvoice}
              onChange={(event) => setAgainstInvoice(event.currentTarget.value)}
            />
          )}
          <DateInput
            label={form.dateLabel}
            value={date}
            onChange={(value) => setDate(value as Date | null)}
            valueFormat="DD MMM YYYY"
            withAsterisk
          />
          <Select
            label={ui.partyLabel}
            placeholder={parties.isLoading ? 'Loading…' : 'Search by name'}
            data={parties.data ?? []}
            value={partyId}
            onChange={setPartyId}
            searchable
            withAsterisk
            nothingFoundMessage={
              form.vendorsOnly
                ? 'No vendor with that name. Tick “vendor” on a customer to add one.'
                : 'No customer with that name'
            }
          />
          {form.showSalesman && (
            <Select
              label="Salesman"
              data={salesmanOptions}
              value={salesmanId}
              onChange={(value) => setSalesmanId(value ?? NO_SALESMAN)}
              searchable
              description={salesmen.data?.length ? undefined : 'No salesmen added yet'}
            />
          )}
          <div>
            <Text fz="sm" fw={500} mb={6}>
              Paymode
            </Text>
            <SegmentedControl
              fullWidth
              value={paymode}
              onChange={(value) => setPaymode(value as Settlement)}
              data={SETTLEMENTS.map((value) => ({ value, label: PAYMODE_LABELS[value] }))}
            />
            <Text fz="xs" c="dimmed" mt={6}>
              {paymode === 'ON_ACCOUNT' ? form.creditHint : form.debitHint}
            </Text>
          </div>
        </SimpleGrid>
      </Card>

      {/* --- Product details -------------------------------------------- */}
      <Paper withBorder radius="lg" p={0}>
        <Group p="md" justify="space-between">
          <div>
            <Text fw={650}>Product details</Text>
            <Text fz="xs" c="dimmed">
              Fill in the row and press Add. Do this for every product.
            </Text>
          </div>
          {items.length > 0 && (
            <Badge variant="light" color="gray" size="lg">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </Badge>
          )}
        </Group>

        <Divider />

        <Stack gap="sm" p="md">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm" style={{ alignItems: 'end' }}>
            <Select
              ref={productRef}
              label="Product name"
              placeholder={products.isLoading ? 'Loading…' : 'Choose a product'}
              data={productOptions}
              value={draft.product_id}
              onChange={chooseProduct}
              searchable
              clearable
              nothingFoundMessage="No product with that name"
            />
            <TextInput
              label="Unit"
              placeholder="pcs, kg, bag"
              value={draft.unit}
              onChange={(event) => setDraftFields({ unit: event.currentTarget.value })}
            />
            <NumberInput
              label="Quantity"
              value={draft.quantity}
              onChange={(value) => setDraftFields({ quantity: value })}
              min={0}
              decimalScale={3}
            />
            <NumberInput
              label="Price"
              placeholder="0.000"
              value={draft.unit_price}
              onChange={(value) => setDraftFields({ unit_price: value })}
              min={0}
              decimalScale={3}
              thousandSeparator=","
            />
            <Button leftSection={<IconPlus size={16} />} onClick={addItem}>
              Add
            </Button>
          </SimpleGrid>

          {itemError && (
            <Alert color="orange" variant="light" py="xs">
              {itemError}
            </Alert>
          )}
        </Stack>

        <Divider />

        {items.length === 0 ? (
          <Stack align="center" gap={6} py={40} px="md" ta="center">
            <ThemeIcon size={44} radius="lg" variant="light" color="brand">
              <IconShoppingCart size={21} stroke={1.5} />
            </ThemeIcon>
            <Text fw={600}>Nothing on this document yet</Text>
            <Text fz="sm" c="dimmed" maw={380}>
              Pick a product above, type the quantity and price, then press Add.
            </Text>
          </Stack>
        ) : isWide ? (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Product</Table.Th>
                  <Table.Th w={110}>Unit</Table.Th>
                  <Table.Th w={110} ta="right">
                    Quantity
                  </Table.Th>
                  <Table.Th w={130} ta="right">
                    Price
                  </Table.Th>
                  <Table.Th w={110} ta="right">
                    VAT
                  </Table.Th>
                  <Table.Th w={140} ta="right">
                    Amount
                  </Table.Th>
                  <Table.Th w={50} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {itemRows.map(({ item, priced: line }) => (
                  <Table.Tr key={item.key}>
                    <Table.Td>
                      <Text fz="sm">{item.description}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c="dimmed">
                        {item.unit || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatQuantity(item.quantity_milli)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(item.unit_price_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(line?.vat_baisa ?? 0, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" fw={650} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(line?.total_baisa ?? 0, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Remove">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`Remove ${item.description}`}
                          onClick={() => removeItem(item.key)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Stack gap="sm" p="md">
            {itemRows.map(({ item, priced: line }) => (
              <Card key={item.key} withBorder padding="md" radius="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div style={{ minWidth: 0 }}>
                    <Text fz="sm" fw={600}>
                      {item.description}
                    </Text>
                    <Text fz="xs" c="dimmed" mt={2}>
                      {formatQuantity(item.quantity_milli)} {item.unit} ×{' '}
                      {formatOMR(item.unit_price_baisa, { symbol: false })}
                    </Text>
                  </div>
                  <Group gap={4} wrap="nowrap">
                    <Text fz="sm" fw={650} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatOMR(line?.total_baisa ?? 0, { symbol: false })}
                    </Text>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Remove ${item.description}`}
                      onClick={() => removeItem(item.key)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Paper>

      {/* --- Money ------------------------------------------------------ */}
      <Paper withBorder radius="lg" p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <Stack gap="md" style={{ flex: '1 1 320px' }}>
            {form.showDiscount && (
              <NumberInput
                label="Disc amount"
                description="Taken off the invoice total"
                placeholder="0.000"
                value={discount}
                onChange={setDiscount}
                min={0}
                decimalScale={3}
                thousandSeparator=","
                maw={240}
                error={discountCapped ? 'That is more than the invoice. The whole total will be taken off.' : undefined}
              />
            )}
            <Textarea
              label="Remarks"
              placeholder="Anything you want to note here"
              value={remarks}
              onChange={(event) => setRemarks(event.currentTarget.value)}
              autosize
              minRows={2}
            />
          </Stack>

          <Stack gap={6} miw={240}>
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">
                Net
              </Text>
              <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(totals.net_baisa)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">
                VAT
              </Text>
              <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(totals.vat_baisa)}
              </Text>
            </Group>
            {totals.discount_baisa > 0 && (
              <Group justify="space-between">
                <Text fz="sm" c="dimmed">
                  Discount
                </Text>
                <Text fz="sm" c="red" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  −{formatOMR(totals.discount_baisa)}
                </Text>
              </Group>
            )}
            <Divider my={4} />
            <Group justify="space-between">
              <Text fw={650}>Grand total</Text>
              <Text fw={700} fz="xl" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(totals.total_baisa)}
              </Text>
            </Group>
          </Stack>
        </Group>
      </Paper>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

      <Group justify="flex-end">
        <Button variant="default" component={Link} to={ui.base}>
          Cancel
        </Button>
        {/* Printing has to save first: there is no bill number until it does. */}
        <Button
          variant="light"
          leftSection={<IconPrinter size={16} />}
          onClick={() => void save(true)}
          loading={create.isPending}
        >
          Save &amp; print
        </Button>
        <Button onClick={() => void save(false)} loading={create.isPending} size="md">
          {form.saveLabel}
        </Button>
      </Group>
    </Stack>
  );
}
