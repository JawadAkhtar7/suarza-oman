/**
 * Moving stock: received, sold, counted, damaged.
 *
 * Asks in the office's words — did more arrive, or did some leave — and turns
 * that into a direction. Every movement needs a reason, because a stock figure
 * nobody can explain is a guess, and a month later the reason is the only thing
 * that settles an argument.
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
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import {
  PRODUCT_UNIT_SHORT,
  formatQuantity,
  toMilli,
  type Product,
  type StockDirection,
  type StockKind,
} from '@suarza-oman/shared';
import { ApiError } from '../../lib/api.js';
import { useAddStockMovement } from '../../lib/products.js';

export interface StockModalProps {
  opened: boolean;
  onClose: () => void;
  product: Product;
}

interface FormValues {
  kind: StockKind;
  direction: StockDirection;
  quantity: number | string;
  reason: string;
  reference: string;
  movement_date: Date;
}

const KIND_HELP: Record<StockKind, string> = {
  PURCHASE: 'Stock came in from a vendor.',
  SALE: 'Stock left because it was sold.',
  SALE_RETURN: 'Stock came back from a customer. Added by a sales return.',
  PURCHASE_RETURN: 'Stock went back to a vendor. Added by a purchase return.',
  ADJUSTMENT: 'A stock count, breakage, or a fix. Pick which way it moves.',
  OPENING: 'What you had when this product was added.',
};

function initialValues(): FormValues {
  return {
    kind: 'PURCHASE',
    direction: 'IN',
    quantity: '',
    reason: '',
    reference: '',
    movement_date: new Date(),
  };
}

export function StockModal({ opened, onClose, product }: StockModalProps) {
  const add = useAddStockMovement(product.id);

  const form = useForm<FormValues>({
    mode: 'uncontrolled',
    initialValues: initialValues(),
    validate: {
      quantity: (value) => {
        const amount = typeof value === 'string' ? Number(value) : value;
        if (!value || Number.isNaN(amount) || amount <= 0) return 'Enter a quantity greater than zero';
        return null;
      },
      reason: (value) => (value.trim() ? null : 'Say why the stock changed'),
    },
  });

  const [kind, setKind] = useState<StockKind>('PURCHASE');
  const [direction, setDirection] = useState<StockDirection>('IN');
  const [quantity, setQuantity] = useState(0);

  useEffect(() => {
    if (!opened) return;
    form.setValues(initialValues());
    form.resetDirty();
    setKind('PURCHASE');
    setDirection('IN');
    setQuantity(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const unit = PRODUCT_UNIT_SHORT[product.unit];
  const after =
    quantity > 0
      ? product.stock_milli + (direction === 'IN' ? toMilli(quantity) : -toMilli(quantity))
      : product.stock_milli;

  const submit = form.onSubmit(async (values) => {
    const typed = typeof values.quantity === 'string' ? Number(values.quantity) : values.quantity;
    try {
      await add.mutateAsync({
        kind: values.kind,
        direction: values.direction,
        quantity_milli: toMilli(typed),
        reason: values.reason,
        reference: values.reference,
        movement_date: values.movement_date,
      });
      notifications.show({
        title: 'Stock updated',
        message: `${product.name} — ${formatQuantity(after)} ${unit} on hand`,
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
        title: 'Could not update stock',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={`Stock movement — ${product.name}`} size="lg">
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            value={kind}
            onChange={(value) => {
              const next = value as StockKind;
              setKind(next);
              form.setFieldValue('kind', next);
              if (next === 'PURCHASE') {
                setDirection('IN');
                form.setFieldValue('direction', 'IN');
              }
              if (next === 'SALE') {
                setDirection('OUT');
                form.setFieldValue('direction', 'OUT');
              }
            }}
            data={[
              { label: 'Received', value: 'PURCHASE' },
              { label: 'Sold', value: 'SALE' },
              { label: 'Adjustment', value: 'ADJUSTMENT' },
            ]}
          />

          <Text fz="xs" c="dimmed" mt={-8}>
            {KIND_HELP[kind]}
          </Text>

          {kind === 'ADJUSTMENT' && (
            <SegmentedControl
              fullWidth
              value={direction}
              onChange={(value) => {
                setDirection(value as StockDirection);
                form.setFieldValue('direction', value as StockDirection);
              }}
              data={[
                { label: 'Add to stock', value: 'IN' },
                { label: 'Take out of stock', value: 'OUT' },
              ]}
            />
          )}

          <Group grow align="flex-end">
            <NumberInput
              label="Quantity"
              placeholder="0"
              suffix={` ${unit}`}
              withAsterisk
              data-autofocus
              min={0}
              decimalScale={3}
              thousandSeparator=","
              {...form.getInputProps('quantity')}
              onChange={(value) => {
                form.getInputProps('quantity').onChange(value);
                setQuantity(Number(value) || 0);
              }}
            />
            <DateInput
              label="Date"
              withAsterisk
              valueFormat="DD MMM YYYY"
              maxDate={new Date()}
              {...form.getInputProps('movement_date')}
            />
          </Group>

          <TextInput
            label="Reference"
            placeholder="Delivery note, invoice number…"
            {...form.getInputProps('reference')}
          />

          <Textarea
            label="Reason"
            placeholder="Why the stock changed"
            withAsterisk
            autosize
            minRows={2}
            maxRows={5}
            {...form.getInputProps('reason')}
          />

          {quantity > 0 && (
            <Alert
              variant="light"
              color={after < 0 ? 'red' : 'brand'}
              icon={<IconInfoCircle size={16} />}
              p="xs"
            >
              <Text fz="sm">
                On hand after this: <strong>{formatQuantity(after)} {unit}</strong>
                {after < 0 && ' — that is more than has ever come in'}
              </Text>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={add.isPending}>
              Record movement
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
