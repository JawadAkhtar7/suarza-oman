/**
 * Writing an entry.
 *
 * The form asks the question in the office's words — is this something they now
 * owe, or something they have paid — and works out debit and credit from the
 * answer. Nobody typing an invoice number should have to remember which way
 * round a debit goes.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { formatOMR, toBaisa, type LedgerDirection, type LedgerKind } from '@suarza-oman/shared';
import { ApiError } from '../../lib/api.js';
import { useAddLedgerEntry } from '../../lib/ledger.js';

export interface EntryModalProps {
  opened: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  balanceBaisa: number;
  /** Which side the modal opens on; the user can still switch. */
  intent: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
}

interface FormValues {
  kind: LedgerKind;
  direction: LedgerDirection;
  amount: number | string;
  description: string;
  reference: string;
  entry_date: Date;
}

const KIND_HELP: Record<LedgerKind, string> = {
  CHARGE: 'Adds to what this customer owes you — an invoice, a delivery, a service.',
  PAYMENT: 'Reduces what they owe — cash, transfer or cheque received.',
  ADJUSTMENT: 'A correction, a discount or a write-off. Choose which way it moves.',
  OPENING: 'What they already owed when this ledger started. Choose which way it moves.',
};

function initialValues(intent: EntryModalProps['intent']): FormValues {
  return {
    kind: intent,
    direction: intent === 'PAYMENT' ? 'CREDIT' : 'DEBIT',
    amount: '',
    description: '',
    reference: '',
    entry_date: new Date(),
  };
}

export function EntryModal({
  opened,
  onClose,
  customerId,
  customerName,
  balanceBaisa,
  intent,
}: EntryModalProps) {
  const add = useAddLedgerEntry(customerId);

  const form = useForm<FormValues>({
    mode: 'uncontrolled',
    initialValues: initialValues(intent),
    validate: {
      amount: (value) => {
        const amount = typeof value === 'string' ? Number(value) : value;
        if (!value || Number.isNaN(amount) || amount <= 0) {
          return 'Enter an amount greater than zero';
        }
        return null;
      },
      description: (value) => (value.trim() ? null : 'Say what this is for'),
    },
  });

  /* Mirrored into state so the help text and the preview re-render as the
     choice changes — an uncontrolled form does not re-render on its own. */
  const [kind, setKind] = useState<LedgerKind>(intent);
  const [direction, setDirection] = useState<LedgerDirection>(
    intent === 'PAYMENT' ? 'CREDIT' : 'DEBIT',
  );
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (!opened) return;
    form.setValues(initialValues(intent));
    form.resetDirty();
    setKind(intent);
    setDirection(intent === 'PAYMENT' ? 'CREDIT' : 'DEBIT');
    setAmount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, intent]);

  const needsDirection = kind === 'ADJUSTMENT' || kind === 'OPENING';

  const submit = form.onSubmit(async (values) => {
    const typed = typeof values.amount === 'string' ? Number(values.amount) : values.amount;
    try {
      await add.mutateAsync({
        kind: values.kind,
        direction: values.direction,
        // Rials in the box, baisa on the wire: the integer is the only form the
        // amount exists in once it leaves this component.
        amount_baisa: toBaisa(typed),
        description: values.description,
        reference: values.reference,
        entry_date: values.entry_date,
      });
      notifications.show({
        title: 'Entry added',
        message: `${formatOMR(toBaisa(typed))} — ${customerName}`,
        color: 'brand',
        icon: <IconCheck size={16} />,
      });
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        form.setErrors(error.fields);
        return;
      }
      notifications.show({
        title: 'Could not add the entry',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    }
  });

  /* What this will do to the balance, in the words the rest of the page uses. */
  const preview =
    amount > 0
      ? balanceBaisa + (direction === 'DEBIT' ? toBaisa(amount) : -toBaisa(amount))
      : balanceBaisa;

  return (
    <Modal opened={opened} onClose={onClose} title={`New entry — ${customerName}`} size="lg">
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            value={kind}
            onChange={(value) => {
              const next = value as LedgerKind;
              setKind(next);
              form.setFieldValue('kind', next);
              if (next === 'CHARGE') {
                setDirection('DEBIT');
                form.setFieldValue('direction', 'DEBIT');
              }
              if (next === 'PAYMENT') {
                setDirection('CREDIT');
                form.setFieldValue('direction', 'CREDIT');
              }
            }}
            data={[
              { label: 'Charge', value: 'CHARGE' },
              { label: 'Payment', value: 'PAYMENT' },
              { label: 'Adjustment', value: 'ADJUSTMENT' },
              { label: 'Opening', value: 'OPENING' },
            ]}
          />

          <Text fz="xs" c="dimmed" mt={-8}>
            {KIND_HELP[kind]}
          </Text>

          {needsDirection && (
            <SegmentedControl
              fullWidth
              value={direction}
              onChange={(value) => {
                setDirection(value as LedgerDirection);
                form.setFieldValue('direction', value as LedgerDirection);
              }}
              data={[
                { label: 'They owe more', value: 'DEBIT' },
                { label: 'They owe less', value: 'CREDIT' },
              ]}
            />
          )}

          <Group grow align="flex-start">
            <NumberInput
              label="Amount (OMR)"
              placeholder="0.000"
              withAsterisk
              data-autofocus
              min={0}
              step={0.1}
              // Three decimals, because a rial has three: 0.500 is half a rial,
              // not five hundred of anything.
              decimalScale={3}
              thousandSeparator=","
              {...form.getInputProps('amount')}
              onChange={(value) => {
                form.getInputProps('amount').onChange(value);
                setAmount(typeof value === 'string' ? Number(value) || 0 : value);
              }}
            />
            <DateInput
              label="Date"
              withAsterisk
              valueFormat="DD MMM YYYY"
              maxDate={new Date()}
              {...form.getInputProps('entry_date')}
            />
          </Group>

          <TextInput
            label="Reference"
            placeholder="INV-104, cheque 887421, transfer id…"
            description="Whatever ties this to paper"
            {...form.getInputProps('reference')}
          />

          <Textarea
            label="Details"
            placeholder="What this entry is for"
            withAsterisk
            autosize
            minRows={2}
            maxRows={5}
            {...form.getInputProps('description')}
          />

          {amount > 0 && (
            <Alert
              variant="light"
              color={preview > 0 ? 'red' : preview < 0 ? 'brand' : 'gray'}
              icon={<IconInfoCircle size={16} />}
              p="xs"
            >
              <Text fz="sm">
                Balance after this entry: <strong>{formatOMR(Math.abs(preview))}</strong>{' '}
                {preview > 0 ? 'owed to you' : preview < 0 ? 'in credit' : '— settled'}
              </Text>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={add.isPending}>
              Add entry
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
