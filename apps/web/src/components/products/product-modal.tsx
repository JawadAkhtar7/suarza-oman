/**
 * Defining a product, and editing one.
 *
 * One form for both, because the fields are the same and a second component is
 * a second place for them to drift. The field set here is a starting point the
 * client will refine — it comes from the shared schema, so changing it there
 * changes the API's validation and this form together.
 */

import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import {
  PRODUCT_UNITS,
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNIT_SHORT,
  createProductSchema,
  formatOMR,
  fromMilli,
  marginPercent,
  toBaisa,
  toMilli,
  type CreateProductInput,
  type Product,
  type ProductUnit,
} from '@suarza-oman/shared';
import { ApiError } from '../../lib/api.js';
import { useCreateProduct, useProductCategories, useUpdateProduct } from '../../lib/products.js';

export interface ProductModalProps {
  opened: boolean;
  onClose: () => void;
  /** Absent means "define a new one"; present means "edit this one". */
  product?: Product | null;
}

interface FormValues extends CreateProductInput {
  cost_price: number | string;
  sale_price: number | string;
  reorder_level: number | string;
  opening_stock: number | string;
}

const EMPTY: FormValues = {
  name: '',
  code: '',
  category: '',
  unit: 'PIECE',
  cost_price_baisa: 0,
  sale_price_baisa: 0,
  vat_rate_percent: 5,
  track_stock: true,
  reorder_level_milli: 0,
  status: 'ACTIVE',
  notes: '',
  cost_price: '',
  sale_price: '',
  reorder_level: '',
  opening_stock: '',
};

const UNIT_OPTIONS = PRODUCT_UNITS.map((unit) => ({
  value: unit,
  label: `${PRODUCT_UNIT_LABELS[unit]} (${PRODUCT_UNIT_SHORT[unit]})`,
}));

/** Runs one field through the shared schema and returns its message, if any. */
function fieldError(field: 'name' | 'code', value: unknown): string | null {
  const result = createProductSchema.shape[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Check this field');
}

export function ProductModal({ opened, onClose, product }: ProductModalProps) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const categories = useProductCategories();
  const editing = Boolean(product);

  const form = useForm<FormValues>({
    mode: 'uncontrolled',
    initialValues: EMPTY,
    validate: {
      name: (value) => fieldError('name', value),
      code: (value) => fieldError('code', value),
    },
  });

  /* Mirrored into state so the margin line and the unit suffixes re-render as
     the values change — an uncontrolled form does not re-render on its own. */
  const [unit, setUnit] = useState<ProductUnit>('PIECE');
  const [cost, setCost] = useState(0);
  const [sale, setSale] = useState(0);
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    if (!opened) return;
    const values: FormValues = product
      ? {
          ...EMPTY,
          name: product.name,
          code: product.code,
          category: product.category,
          unit: product.unit,
          vat_rate_percent: product.vat_rate_percent,
          track_stock: product.track_stock,
          status: product.status,
          notes: product.notes,
          cost_price: product.cost_price_baisa > 0 ? product.cost_price_baisa / 1000 : '',
          sale_price: product.sale_price_baisa > 0 ? product.sale_price_baisa / 1000 : '',
          reorder_level: product.reorder_level_milli > 0 ? fromMilli(product.reorder_level_milli) : '',
        }
      : EMPTY;

    form.setValues(values);
    form.resetDirty();
    setUnit(values.unit);
    setCost(product ? product.cost_price_baisa : 0);
    setSale(product ? product.sale_price_baisa : 0);
    setTracks(values.track_stock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, product?.id]);

  const submit = form.onSubmit(async (values) => {
    const { cost_price, sale_price, reorder_level, opening_stock, ...rest } = values;
    const number = (value: number | string) => {
      const parsed = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };

    const payload = {
      ...rest,
      // Rials and units in the boxes; baisa and thousandths on the wire.
      cost_price_baisa: toBaisa(number(cost_price)),
      sale_price_baisa: toBaisa(number(sale_price)),
      reorder_level_milli: toMilli(number(reorder_level)),
    };

    try {
      if (product) {
        // No opening stock on an edit: it is already a movement, and sending it
        // again would add the same stock twice.
        await update.mutateAsync({ id: product.id, input: payload });
      } else {
        await create.mutateAsync({ ...payload, opening_stock_milli: toMilli(number(opening_stock)) });
      }
      notifications.show({
        title: editing ? 'Product updated' : 'Product added',
        message: values.name,
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
        title: 'Could not save',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    }
  });

  const margin = marginPercent(cost, sale);
  const busy = create.isPending || update.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `Edit ${product?.name}` : 'New product'}
      size="lg"
    >
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Product name"
              placeholder="Cement 50kg bag"
              withAsterisk
              data-autofocus
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Code"
              placeholder="CEM50"
              description="Optional, but no two products can share one"
              {...form.getInputProps('code')}
            />
            <Autocomplete
              label="Category"
              placeholder="Building materials"
              data={categories.data ?? []}
              {...form.getInputProps('category')}
            />
            <Select
              label="Unit"
              data={UNIT_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('unit')}
              onChange={(value) => {
                form.getInputProps('unit').onChange(value);
                setUnit((value as ProductUnit) ?? 'PIECE');
              }}
            />
          </SimpleGrid>

          <Divider label="Pricing" labelPosition="left" />

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <NumberInput
              label="Cost price"
              placeholder="0.000"
              prefix="OMR "
              min={0}
              decimalScale={3}
              thousandSeparator=","
              {...form.getInputProps('cost_price')}
              onChange={(value) => {
                form.getInputProps('cost_price').onChange(value);
                setCost(toBaisa(Number(value) || 0));
              }}
            />
            <NumberInput
              label="Sale price"
              placeholder="0.000"
              prefix="OMR "
              min={0}
              decimalScale={3}
              thousandSeparator=","
              {...form.getInputProps('sale_price')}
              onChange={(value) => {
                form.getInputProps('sale_price').onChange(value);
                setSale(toBaisa(Number(value) || 0));
              }}
            />
            <NumberInput
              label="VAT rate"
              suffix=" %"
              min={0}
              max={100}
              decimalScale={2}
              {...form.getInputProps('vat_rate_percent')}
            />
          </SimpleGrid>

          {margin !== null && (
            <Text fz="xs" c={margin < 0 ? 'red' : 'dimmed'} mt={-8}>
              {margin < 0
                ? `Selling below cost — losing ${formatOMR(cost - sale)} per ${PRODUCT_UNIT_SHORT[unit]}`
                : `Margin ${margin.toFixed(1)}% — ${formatOMR(sale - cost)} per ${PRODUCT_UNIT_SHORT[unit]}`}
            </Text>
          )}

          <Divider label="Stock" labelPosition="left" />

          <Checkbox
            label="Keep track of how many are in stock"
            description="Turn this off for services and charges — delivery, labour, a fee."
            {...form.getInputProps('track_stock', { type: 'checkbox' })}
            onChange={(event) => {
              form.getInputProps('track_stock', { type: 'checkbox' }).onChange(event);
              setTracks(event.currentTarget.checked);
            }}
          />

          {tracks && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {!editing && (
                <NumberInput
                  label="Opening stock"
                  placeholder="0"
                  suffix={` ${PRODUCT_UNIT_SHORT[unit]}`}
                  min={0}
                  decimalScale={3}
                  thousandSeparator=","
                  description="Recorded as the first stock movement"
                  {...form.getInputProps('opening_stock')}
                />
              )}
              <NumberInput
                label="Warn below"
                placeholder="0"
                suffix={` ${PRODUCT_UNIT_SHORT[unit]}`}
                min={0}
                decimalScale={3}
                thousandSeparator=","
                description="Leave empty for no warning"
                {...form.getInputProps('reorder_level')}
              />
            </SimpleGrid>
          )}

          <Select
            label="Status"
            data={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
            allowDeselect={false}
            {...form.getInputProps('status')}
          />

          <Textarea
            label="Notes"
            placeholder="Anything the team should know about this product"
            autosize
            minRows={2}
            maxRows={5}
            {...form.getInputProps('notes')}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {editing ? 'Save changes' : 'Add product'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
