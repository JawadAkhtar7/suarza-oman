/**
 * Sales invoices, purchases or sales returns — one screen, told which it is.
 *
 * The three are the same table of the same documents; only the wording differs,
 * and that lives in DOCUMENT_UI rather than in ternaries down this file.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Pagination,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import {
  IconFileInvoice,
  IconPlus,
  IconReceipt2,
  IconRefresh,
  IconSearch,
  IconShoppingCart,
  IconX,
} from '@tabler/icons-react';
import {
  formatDate,
  formatOMR,
  type DocumentKind,
  type TradeDocument,
} from '@suarza-oman/shared';
import { useDocumentSummary, useDocuments, type DocumentListParams } from '../lib/documents.js';
import { DOCUMENT_UI } from '../components/documents/kind.js';

const PAGE_SIZE = 25;

function Tile({
  label,
  value,
  hint,
  icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Card withBorder radius="lg" padding="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
            {label}
          </Text>
          {loading ? (
            <Skeleton height={30} width={120} mt={8} />
          ) : (
            <Text
              fz={26}
              fw={700}
              mt={6}
              c={color === 'gray' ? undefined : color}
              style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}
            >
              {value}
            </Text>
          )}
          <Text fz="xs" c="dimmed" mt={6}>
            {hint}
          </Text>
        </div>
        <ThemeIcon size={40} radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
      </Group>
    </Card>
  );
}

export interface DocumentsPageProps {
  kind: DocumentKind;
}

export function DocumentsPage({ kind }: DocumentsPageProps) {
  const navigate = useNavigate();
  const ui = DOCUMENT_UI[kind];
  const base = ui.base;
  const settlementLabels = ui.settlementLabels;
  /* The only thing left that varies by hand is the icon: a trolley for the two
     sales screens, an invoice for the two purchase ones. */
  const isSale = kind === 'SALE' || kind === 'SALE_RETURN';

  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [settlement, setSettlement] = useState<DocumentListParams['settlement']>('ALL');
  const [page, setPage] = useState(1);
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const summary = useDocumentSummary(kind);
  const query = useDocuments({
    kind,
    q: debounced,
    status: 'ALL',
    settlement,
    page,
    page_size: PAGE_SIZE,
  });

  useEffect(() => setPage(1), [debounced, settlement]);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const open = (document: TradeDocument) => navigate(`${base}/${document.id}`);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Group gap="sm">
            <Title order={1} fz={26}>
              {ui.listTitle}
            </Title>
            {total > 0 && (
              <Badge variant="light" color="gray" size="lg">
                {total}
              </Badge>
            )}
          </Group>
          <Text c="dimmed" fz="sm" mt={4}>
            {ui.listBlurb}
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={17} />}
          component={Link}
          to={`${base}/new`}
          size="md"
        >
          {ui.newLabel}
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Tile
          label={ui.valueTileLabel}
          value={formatOMR(summary.data?.total_baisa ?? 0)}
          hint={`${summary.data?.count ?? 0} saved ${summary.data?.count === 1 ? 'document' : 'documents'}`}
          icon={isSale ? <IconShoppingCart size={21} stroke={1.7} /> : <IconFileInvoice size={21} stroke={1.7} />}
          color="gray"
          loading={summary.isLoading}
        />
        <Tile
          label="VAT"
          value={formatOMR(summary.data?.vat_baisa ?? 0)}
          hint={ui.vatTileHint}
          icon={<IconReceipt2 size={21} stroke={1.7} />}
          color="gray"
          loading={summary.isLoading}
        />
        <Tile
          label="Not yet paid"
          value={formatOMR(summary.data?.on_account_baisa ?? 0)}
          hint={ui.onAccountTileHint}
          icon={<IconReceipt2 size={21} stroke={1.7} />}
          color={isSale ? 'red' : 'orange'}
          loading={summary.isLoading}
        />
      </SimpleGrid>

      <Paper withBorder radius="lg" p={0}>
        <Group p="md" gap="sm" wrap="wrap" justify="space-between">
          <TextInput
            placeholder="Search number, name or reference"
            leftSection={<IconSearch size={16} stroke={1.7} />}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" color="gray" onClick={() => setSearch('')} aria-label="Clear search">
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            style={{ flex: '1 1 300px' }}
            size="md"
          />
          <Group gap="sm">
            <SegmentedControl
              value={settlement}
              onChange={(value) => setSettlement(value as DocumentListParams['settlement'])}
              data={[
                { label: 'All', value: 'ALL' },
                { label: settlementLabels.PAID, value: 'PAID' },
                { label: settlementLabels.ON_ACCOUNT, value: 'ON_ACCOUNT' },
              ]}
              size="md"
            />
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => {
                  void query.refetch();
                  void summary.refetch();
                }}
                loading={query.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={17} stroke={1.7} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {query.isLoading ? (
          <Stack gap="xs" p="md">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={46} radius="sm" />
            ))}
          </Stack>
        ) : rows.length === 0 ? (
          <Center py={56} px="md">
            <Stack align="center" gap="xs" maw={360} ta="center">
              <ThemeIcon size={52} radius="lg" variant="light" color="brand">
                {isSale ? <IconShoppingCart size={24} stroke={1.5} /> : <IconFileInvoice size={24} stroke={1.5} />}
              </ThemeIcon>
              <Text fw={650} fz="lg">
                {debounced || settlement !== 'ALL'
                  ? 'Nothing matches that'
                  : ui.emptyTitle}
              </Text>
              <Text c="dimmed" fz="sm">
                {ui.emptyBlurb}
              </Text>
              <Button mt="xs" component={Link} to={`${base}/new`} leftSection={<IconPlus size={16} />}>
                {ui.emptyAction}
              </Button>
            </Stack>
          </Center>
        ) : isWide ? (
          <Table.ScrollContainer minWidth={780}>
            <Table verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{ui.numberColumn}</Table.Th>
                  <Table.Th>{ui.partyLabel}</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th ta="right">Net</Table.Th>
                  <Table.Th ta="right">VAT</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                  <Table.Th>{ui.settlementColumn}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((document) => (
                  <Table.Tr
                    key={document.id}
                    onClick={() => open(document)}
                    style={{ cursor: 'pointer', opacity: document.status === 'VOID' ? 0.55 : 1 }}
                  >
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <Text fz="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {document.number}
                        </Text>
                        {document.status === 'VOID' && (
                          <Badge size="xs" color="red" variant="light">
                            Cancelled
                          </Badge>
                        )}
                      </Group>
                      {(document.reference ||
                        document.against_invoice_number ||
                        document.salesman_name) && (
                        <Text fz="xs" c="dimmed">
                          {[
                            document.reference,
                            document.against_invoice_number &&
                              `against ${document.against_invoice_number}`,
                            document.salesman_name,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{document.party_name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c="dimmed">
                        {formatDate(document.document_date)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(document.net_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(document.vat_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" fw={650} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(document.total_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={document.settlement === 'PAID' ? 'brand' : 'orange'}
                      >
                        {settlementLabels[document.settlement]}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Stack gap="sm" p="md">
            {rows.map((document) => (
              <UnstyledButton key={document.id} onClick={() => open(document)}>
                <Card withBorder padding="md" radius="md" opacity={document.status === 'VOID' ? 0.6 : 1}>
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text fz="sm" fw={600}>
                        {document.number}
                      </Text>
                      <Text fz="xs" c="dimmed" truncate>
                        {document.party_name}
                      </Text>
                    </div>
                    <Text fz="sm" fw={650} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatOMR(document.total_baisa, { symbol: false })}
                    </Text>
                  </Group>
                  <Group justify="space-between" mt="sm">
                    <Badge size="sm" variant="light" color={document.settlement === 'PAID' ? 'brand' : 'orange'}>
                      {settlementLabels[document.settlement]}
                    </Badge>
                    <Text fz="xs" c="dimmed">
                      {formatDate(document.document_date)}
                    </Text>
                  </Group>
                </Card>
              </UnstyledButton>
            ))}
          </Stack>
        )}

        {rows.length > 0 && (
          <Group justify="space-between" p="md" wrap="wrap" gap="sm">
            <Text fz="sm" c="dimmed">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </Text>
            {pages > 1 && <Pagination value={page} onChange={setPage} total={pages} size="sm" />}
          </Group>
        )}
      </Paper>
    </Stack>
  );
}
