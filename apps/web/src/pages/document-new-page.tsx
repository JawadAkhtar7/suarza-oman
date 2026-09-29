/**
 * Writing a sale or a purchase.
 *
 * A full page rather than a modal: lines need room, and this is the screen
 * somebody spends a minute in with a delivery note in their other hand.
 *
 * Choosing a product fills in the description, unit, price and VAT — and every
 * one of those stays editable, because the price on the paper in front of them
 * is the one that goes on the invoice.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
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
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowLeft, IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import {
  PRODUCT_UNIT_SHORT,
  SETTLEMENTS,
  SETTLEMENT_LABELS,
  documentTotals,
  formatOMR,
  priceLine,
  toBaisa,
  toMilli,
  type DocumentKind,
} from '@suarza-oman/shared';
import { ApiError } from '../lib/api.js';
import { useCreateDocument } from '../lib/documents.js';
import { usePartyOptions, useProductOptions } from '../components/documents/pickers.js';

interface LineDraft {
  key: string;
  product_id: string;
  description: string;
  unit: string;
  quantity: number | string;
  unit_price: number | string;
  vat_rate_percent: number | string;
}

const emptyLine = (): LineDraft => ({
  key: Math.random().toString(36).slice(2),
  product_id: '',
  description: '',
  unit: '',
  quantity: 1,
  unit_price: '',
  vat_rate_percent: 5,
});

const num = (value: number | string) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface DocumentNewPageProps {
  kind: DocumentKind;
}

export function DocumentNewPage({ kind }: DocumentNewPageProps) {
  const navigate = useNavigate();
  const isSale = kind === 'SALE';
  const isWide = useMediaQuery('(min-width: 62em)', true);

  const parties = usePartyOptions(!isSale);
  const products = useProductOptions();
  const create = useCreateDocument();

  const [partyId, setPartyId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(new Date());
  const [reference, setReference] = useState('');
  const [settlement, setSettlement] = useState<(typeof SETTLEMENTS)[number]>('ON_ACCOUNT');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const productOptions = useMemo(
    () =>
      (products.data?.rows ?? []).map((product) => ({
        value: product.id,
        label: product.code ? `${product.name} (${product.code})` : product.name,
      })),
    [products.data],
  );

  const priced = lines.map((line) =>
    priceLine({
      quantity_milli: toMilli(num(line.quantity)),
      unit_price_baisa: toBaisa(num(line.unit_price)),
      vat_rate_percent: num(line.vat_rate_percent),
    }),
  );
  const totals = documentTotals(priced);

  const setLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  /** Picking a product fills the line in; every field stays editable after. */
  const chooseProduct = (key: string, productId: string | null) => {
    const product = (products.data?.rows ?? []).find((row) => row.id === productId);
    if (!product) {
      setLine(key, { product_id: '' });
      return;
    }
    setLine(key, {
      product_id: product.id,
      description: product.name,
      unit: PRODUCT_UNIT_SHORT[product.unit],
      unit_price: (isSale ? product.sale_price_baisa : product.cost_price_baisa) / 1000 || '',
      vat_rate_percent: product.vat_rate_percent,
    });
  };

  const submit = async () => {
    setError(null);
    if (!partyId) {
      setError(isSale ? 'Choose the customer this sale is for.' : 'Choose the supplier.');
      return;
    }
    if (!date) {
      setError('Pick a date.');
      return;
    }
    const usable = lines.filter((line) => line.description.trim() && num(line.quantity) > 0);
    if (usable.length === 0) {
      setError('Add at least one line with a description and a quantity.');
      return;
    }

    try {
      const { document } = await create.mutateAsync({
        kind,
        party_id: partyId,
        document_date: date,
        reference,
        settlement,
        notes,
        lines: usable.map((line) => ({
          product_id: line.product_id,
          description: line.description.trim(),
          unit: line.unit,
          quantity_milli: toMilli(num(line.quantity)),
          unit_price_baisa: toBaisa(num(line.unit_price)),
          vat_rate_percent: num(line.vat_rate_percent),
        })),
      });

      notifications.show({
        title: isSale ? 'Sale recorded' : 'Purchase recorded',
        message: `${document.number} — ${formatOMR(document.total_baisa)}`,
        color: 'brand',
        icon: <IconCheck size={16} />,
      });
      navigate(`/${isSale ? 'sales' : 'purchases'}/${document.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'Could not save',
      );
    }
  };

  const backTo = isSale ? '/sales' : '/purchases';

  return (
    <Stack gap="lg">
      <Anchor component={Link} to={backTo} fz="sm" c="dimmed">
        <Group gap={6}>
          <IconArrowLeft size={15} /> {isSale ? 'Sales' : 'Purchases'}
        </Group>
      </Anchor>

      <div>
        <Title order={1} fz={26}>
          {isSale ? 'New sale' : 'New purchase'}
        </Title>
        <Text c="dimmed" fz="sm" mt={4}>
          {isSale
            ? 'Stock goes out and the customer’s account is charged when you save.'
            : 'Stock comes in and the supplier’s account is credited when you save.'}
        </Text>
      </div>

      <Card withBorder radius="lg" padding="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <Select
            label={isSale ? 'Customer' : 'Supplier'}
            placeholder={parties.isLoading ? 'Loading…' : 'Search by name'}
            data={parties.data ?? []}
            value={partyId}
            onChange={setPartyId}
            searchable
            withAsterisk
            nothingFoundMessage={isSale ? 'No customer' : 'No supplier — tick “vendor” on a customer'}
          />
          <DateInput
            label="Date"
            value={date}
            onChange={(value) => setDate(value as Date | null)}
            valueFormat="DD MMM YYYY"
            withAsterisk
          />
          <TextInput
            label={isSale ? 'Reference' : 'Their invoice number'}
            placeholder={isSale ? 'LPO, delivery note…' : 'Supplier invoice no.'}
            value={reference}
            onChange={(event) => setReference(event.currentTarget.value)}
          />
          <div>
            <Text fz="sm" fw={500} mb={6}>
              Settlement
            </Text>
            <SegmentedControl
              fullWidth
              value={settlement}
              onChange={(value) => setSettlement(value as (typeof SETTLEMENTS)[number])}
              data={SETTLEMENTS.map((value) => ({ value, label: SETTLEMENT_LABELS[value] }))}
            />
          </div>
        </SimpleGrid>
      </Card>

      <Paper withBorder radius="lg" p={0}>
        <Group p="md" justify="space-between">
          <Text fw={650}>Lines</Text>
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconPlus size={15} />}
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            Add line
          </Button>
        </Group>

        {isWide ? (
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="xs" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={230}>Product</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th w={120}>Qty</Table.Th>
                  <Table.Th w={140}>Unit price</Table.Th>
                  <Table.Th w={90}>VAT</Table.Th>
                  <Table.Th w={120} ta="right">
                    Total
                  </Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lines.map((line, index) => (
                  <Table.Tr key={line.key}>
                    <Table.Td>
                      <Select
                        placeholder="Choose…"
                        data={productOptions}
                        value={line.product_id || null}
                        onChange={(value) => chooseProduct(line.key, value)}
                        searchable
                        clearable
                        size="sm"
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        placeholder="What was sold"
                        value={line.description}
                        onChange={(event) => setLine(line.key, { description: event.currentTarget.value })}
                        size="sm"
                      />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={line.quantity}
                        onChange={(value) => setLine(line.key, { quantity: value })}
                        min={0}
                        decimalScale={3}
                        suffix={line.unit ? ` ${line.unit}` : ''}
                        size="sm"
                      />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={line.unit_price}
                        onChange={(value) => setLine(line.key, { unit_price: value })}
                        min={0}
                        decimalScale={3}
                        thousandSeparator=","
                        size="sm"
                      />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={line.vat_rate_percent}
                        onChange={(value) => setLine(line.key, { vat_rate_percent: value })}
                        min={0}
                        max={100}
                        suffix="%"
                        size="sm"
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(priced[index]?.total_baisa ?? 0, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Remove line">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`Remove line ${index + 1}`}
                          disabled={lines.length === 1}
                          onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
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
          <Stack gap="md" p="md">
            {lines.map((line, index) => (
              <Card key={line.key} withBorder padding="md" radius="md">
                <Group justify="space-between" mb="xs">
                  <Text fz="sm" fw={600}>
                    Line {index + 1}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <Stack gap="xs">
                  <Select
                    placeholder="Choose a product"
                    data={productOptions}
                    value={line.product_id || null}
                    onChange={(value) => chooseProduct(line.key, value)}
                    searchable
                    clearable
                  />
                  <TextInput
                    placeholder="Description"
                    value={line.description}
                    onChange={(event) => setLine(line.key, { description: event.currentTarget.value })}
                  />
                  <Group grow>
                    <NumberInput
                      label="Qty"
                      value={line.quantity}
                      onChange={(value) => setLine(line.key, { quantity: value })}
                      min={0}
                      decimalScale={3}
                    />
                    <NumberInput
                      label="Price"
                      value={line.unit_price}
                      onChange={(value) => setLine(line.key, { unit_price: value })}
                      min={0}
                      decimalScale={3}
                    />
                    <NumberInput
                      label="VAT"
                      value={line.vat_rate_percent}
                      onChange={(value) => setLine(line.key, { vat_rate_percent: value })}
                      min={0}
                      max={100}
                      suffix="%"
                    />
                  </Group>
                  <Text fz="sm" ta="right" fw={600}>
                    {formatOMR(priced[index]?.total_baisa ?? 0)}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}

        <Divider />

        <Group p="md" justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <Textarea
            label="Notes"
            placeholder="Anything worth recording on this document"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            autosize
            minRows={2}
            style={{ flex: '1 1 320px' }}
          />
          <Stack gap={6} miw={220}>
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
            <Divider my={4} />
            <Group justify="space-between">
              <Text fw={650}>Total</Text>
              <Text fw={700} fz="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
        <Button variant="default" component={Link} to={backTo}>
          Cancel
        </Button>
        <Button onClick={submit} loading={create.isPending} size="md">
          {isSale ? 'Record sale' : 'Record purchase'}
        </Button>
      </Group>
    </Stack>
  );
}
