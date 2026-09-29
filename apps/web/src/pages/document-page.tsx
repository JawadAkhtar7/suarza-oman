/**
 * One sale or purchase, as the document it is.
 *
 * Laid out like the piece of paper it replaces, because that is what somebody
 * is holding when they open this screen to check it.
 */

import { Link, useParams } from 'react-router-dom';
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
import { IconArrowLeft, IconBan, IconReceipt2 } from '@tabler/icons-react';
import {
  SETTLEMENT_LABELS,
  formatDate,
  formatDateTime,
  formatOMR,
  formatQuantity,
  type DocumentKind,
} from '@suarza-oman/shared';
import { useDocument, useVoidDocument } from '../lib/documents.js';

export interface DocumentPageProps {
  kind: DocumentKind;
}

export function DocumentPage({ kind }: DocumentPageProps) {
  const { documentId = '' } = useParams();
  const isSale = kind === 'SALE';
  const base = isSale ? '/sales' : '/purchases';
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const query = useDocument(documentId);
  const voidDocument = useVoidDocument();

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
        <Anchor component={Link} to={base} fz="sm">
          <Group gap={6}>
            <IconArrowLeft size={15} /> {isSale ? 'Sales' : 'Purchases'}
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

  const confirmVoid = () => {
    let reason = '';
    modals.openConfirmModal({
      title: `Void ${document.number}?`,
      centered: true,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            The stock it moved goes back, and the entry on {document.party_name}’s account stops
            counting. Both stay on record.
          </Text>
          <Textarea
            label="Why is it being voided?"
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
      labels: { confirm: 'Void document', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (!reason.trim()) {
          notifications.show({
            title: 'A reason is needed',
            message: 'Say why it is being voided, then try again.',
            color: 'red',
          });
          return;
        }
        try {
          await voidDocument.mutateAsync({ id: document.id, void_reason: reason.trim() });
          notifications.show({ title: 'Document voided', message: document.number, color: 'gray' });
        } catch (error) {
          notifications.show({
            title: 'Could not void',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
          });
        }
      },
    });
  };

  return (
    <Stack gap="lg">
      <Anchor component={Link} to={base} fz="sm" c="dimmed">
        <Group gap={6}>
          <IconArrowLeft size={15} /> {isSale ? 'Sales' : 'Purchases'}
        </Group>
      </Anchor>

      {voided && (
        <Alert color="red" variant="light" title="This document is void" icon={<IconBan size={18} />}>
          {document.void_reason}
          {document.voided_at && ` · ${formatDateTime(document.voided_at)}`}
        </Alert>
      )}

      <Card withBorder radius="lg" padding="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <div>
            <Group gap="sm">
              <Title order={1} fz={24} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {document.number}
              </Title>
              <Badge variant="light" color={document.settlement === 'PAID' ? 'brand' : 'orange'}>
                {SETTLEMENT_LABELS[document.settlement]}
              </Badge>
            </Group>
            <Text c="dimmed" fz="sm" mt={4}>
              {isSale ? 'Sold to' : 'Bought from'}{' '}
              <Anchor component={Link} to={`/ledger/${document.party_id}`} fz="sm">
                {document.party_name}
              </Anchor>
              {' · '}
              {formatDate(document.document_date)}
              {document.reference ? ` · ${document.reference}` : ''}
            </Text>
          </div>

          {!voided && (
            <Button variant="light" color="red" leftSection={<IconBan size={16} />} onClick={confirmVoid}>
              Void
            </Button>
          )}
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
            <Divider my={4} />
            <Group justify="space-between">
              <Text fw={650}>Total</Text>
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
                {voided
                  ? 'The stock has been put back and the ledger entry no longer counts.'
                  : isSale
                    ? 'Stock went out, and the total was charged to the customer’s account.'
                    : 'Stock came in, and the total was credited to the supplier’s account.'}
              </Text>
              <Anchor component={Link} to={`/ledger/${document.party_id}`} fz="sm" mt={6} display="block">
                Open {document.party_name}’s ledger →
              </Anchor>
            </div>
          </Group>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
