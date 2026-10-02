/**
 * One sale, purchase or sales return, as the document it is.
 *
 * Laid out like the piece of paper it replaces, because that is what somebody
 * is holding when they open this screen to check it. The paper version itself
 * is rendered alongside and only appears when the browser prints - see
 * PrintableDocument.
 */

import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconBan, IconPrinter, IconReceipt2 } from '@tabler/icons-react';
import {
  formatDate,
  formatDateTime,
  formatOMR,
  formatQuantity,
  type DocumentKind,
} from '@suarza-oman/shared';
import { useDocument, useVoidDocument } from '../lib/documents.js';
import { DOCUMENT_UI } from '../components/documents/kind.js';
import { PrintableDocument } from '../components/documents/printable-document.js';

export interface DocumentPageProps {
  kind: DocumentKind;
}

export function DocumentPage({ kind }: DocumentPageProps) {
  const { documentId = '' } = useParams();
  const location = useLocation();
  const ui = DOCUMENT_UI[kind];
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const query = useDocument(documentId);
  const voidDocument = useVoidDocument();

  /* "Save and print" lands here and prints once. Guarded by a ref because the
     dialog must not reopen when the query refetches or the tab regains focus -
     an invoice that prints itself twice wastes the paper and the operator's
     afternoon. */
  const printRequested = (location.state as { print?: boolean } | null)?.print === true;
  const printed = useRef(false);
  const ready = query.isSuccess;
  useEffect(() => {
    if (!printRequested || !ready || printed.current) return;
    printed.current = true;
    /* Forget the request, so reloading this page does not print it again. */
    window.history.replaceState({}, '');
    /* A moment, so the sheet is in the DOM before the dialog is raised. */
    const timer = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(timer);
  }, [printRequested, ready]);

  if (query.isLoading) {
    return (
      <Center py={80}>
        <Loader />
      </Center>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Stack gap="md">
        <Anchor component={Link} to={ui.base} fz="sm">
          <Group gap={6}>
            <IconArrowLeft size={15} /> {ui.listTitle}
          </Group>
        </Anchor>
        <Alert color="red" title="Could not open this document">
          {query.error instanceof Error ? query.error.message : 'Unknown error'}
        </Alert>
      </Stack>
    );
  }

  const document = query.data;
  const voided = document.status === 'VOID';
  /* Every kind is numbered 1, 2, 3 on its own run, so the number alone does not
     say what you are looking at. The noun carries that: "Invoice 7",
     "Purchase return 1". */
  const title = `${ui.noun} ${document.number}`;
  const settlementLabel = ui.settlementLabels[document.settlement];

  const confirmVoid = () => {
    let reason = '';
    modals.openConfirmModal({
      title: `Cancel ${title}?`,
      centered: true,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            The stock goes back, and the amount on {document.party_name}’s account stops
            counting. Both stay on record, so nothing is lost.
          </Text>
          <Textarea
            label="Why are you cancelling it?"
            placeholder="Entered twice, wrong customer, goods returned…"
            withAsterisk
            autosize
            minRows={2}
            onChange={(event) => {
              reason = event.currentTarget.value;
            }}
          />
        </Stack>
      ),
      labels: { confirm: 'Cancel it', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (!reason.trim()) {
          notifications.show({
            title: 'Please give a reason',
            message: 'Write why, then try again.',
            color: 'red',
          });
          return;
        }
        try {
          await voidDocument.mutateAsync({ id: document.id, void_reason: reason.trim() });
          notifications.show({ title: 'Cancelled', message: title, color: 'gray' });
        } catch (error) {
          notifications.show({
            title: 'Could not cancel it',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
          });
        }
      },
    });
  };

  return (
    <>
      <PrintableDocument document={document} />

      <Stack gap="lg" data-print="hide">
      <Anchor component={Link} to={ui.base} fz="sm" c="dimmed">
        <Group gap={6}>
          <IconArrowLeft size={15} /> {ui.listTitle}
        </Group>
      </Anchor>

      {voided && (
        <Alert color="red" variant="light" title="This one was cancelled" icon={<IconBan size={18} />}>
          {document.void_reason}
          {document.voided_at && ` · ${formatDateTime(document.voided_at)}`}
        </Alert>
      )}

      <Card withBorder radius="lg" padding="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <div>
            <Group gap="sm">
              <Title order={1} fz={24} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {title}
              </Title>
              <Badge variant="light" color={document.settlement === 'PAID' ? 'brand' : 'orange'}>
                {settlementLabel}
              </Badge>
            </Group>
            <Text c="dimmed" fz="sm" mt={4}>
              {ui.partyPreposition}{' '}
              <Anchor component={Link} to={`/ledger/${document.party_id}`} fz="sm">
                {document.party_name}
              </Anchor>
              {' · '}
              {formatDate(document.document_date)}
              {document.reference ? ` · Ref ${document.reference}` : ''}
              {document.against_invoice_number
                ? ` · Against invoice ${document.against_invoice_number}`
                : ''}
              {document.salesman_name ? ` · Sold by ${document.salesman_name}` : ''}
            </Text>
          </div>

          <Group gap="sm">
            <Button
              variant="default"
              leftSection={<IconPrinter size={16} />}
              onClick={() => window.print()}
            >
              Print
            </Button>
            {!voided && (
              <Button
                variant="light"
                color="red"
                leftSection={<IconBan size={16} />}
                onClick={confirmVoid}
              >
                Cancel it
              </Button>
            )}
          </Group>
        </Group>
      </Card>

      <Paper withBorder radius="lg" p={0}>
        {isWide ? (
          <Table verticalSpacing="sm" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Description</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Unit price</Table.Th>
                <Table.Th ta="right">Net</Table.Th>
                <Table.Th ta="right">VAT</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {document.lines.map((line, index) => (
                <Table.Tr key={`${line.description}-${index}`}>
                  <Table.Td>
                    <Text fz="sm">{line.description}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatQuantity(line.quantity_milli)} {line.unit}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatOMR(line.unit_price_baisa, { symbol: false })}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatOMR(line.net_baisa, { symbol: false })}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fz="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatOMR(line.vat_baisa, { symbol: false })}
                      <Text component="span" fz="xs" c="dimmed">
                        {' '}
                        ({line.vat_rate_percent}%)
                      </Text>
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fz="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatOMR(line.total_baisa, { symbol: false })}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Stack gap="sm" p="md">
            {document.lines.map((line, index) => (
              <Card key={`${line.description}-${index}`} withBorder padding="md" radius="md">
                <Text fz="sm" fw={600}>
                  {line.description}
                </Text>
                <Group justify="space-between" mt="xs">
                  <Text fz="xs" c="dimmed">
                    {formatQuantity(line.quantity_milli)} {line.unit} ×{' '}
                    {formatOMR(line.unit_price_baisa, { symbol: false })}
                  </Text>
                  <Text fz="sm" fw={650}>
                    {formatOMR(line.total_baisa, { symbol: false })}
                  </Text>
                </Group>
              </Card>
            ))}
          </Stack>
        )}

        <Divider />

        <Group p="md" justify="flex-end">
          <Stack gap={6} miw={240}>
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">
                Net
              </Text>
              <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(document.net_baisa)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">
                VAT
              </Text>
              <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(document.vat_baisa)}
              </Text>
            </Group>
            {document.discount_baisa > 0 && (
              <Group justify="space-between">
                <Text fz="sm" c="dimmed">
                  Discount
                </Text>
                <Text fz="sm" c="red" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  −{formatOMR(document.discount_baisa)}
                </Text>
              </Group>
            )}
            <Divider my={4} />
            <Group justify="space-between">
              <Text fw={650}>{ui.totalLabel}</Text>
              <Text fw={700} fz="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(document.total_baisa)}
              </Text>
            </Group>
          </Stack>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {document.notes && (
          <Card withBorder radius="lg" padding="lg">
            <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
              Notes
            </Text>
            <Text fz="sm" mt={6}>
              {document.notes}
            </Text>
          </Card>
        )}
        <Card withBorder radius="lg" padding="lg">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <IconReceipt2 size={18} style={{ marginTop: 2 }} />
            <div>
              <Text fz="sm" fw={600}>
                What this did
              </Text>
              <Text fz="sm" c="dimmed" mt={4}>
                {voided ? ui.voidedEffect : ui.effect}
              </Text>
              <Anchor component={Link} to={`/ledger/${document.party_id}`} fz="sm" mt={6} display="block">
                Open {document.party_name}’s account →
              </Anchor>
            </div>
          </Group>
        </Card>
      </SimpleGrid>
      </Stack>
    </>
  );
}
