/**
 * Create and edit, in one modal.
 *
 * The same form serves both because the fields are the same and a second
 * component would be a second place for them to drift apart. Validation comes
 * from the shared Zod schema, so the browser refuses exactly what the API would
 * have refused — the user finds out before the round trip, not after it.
 */

import { useEffect } from 'react';
import {
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
import {
  PAY_MODES,
  PAY_MODE_LABELS,
  createCustomerSchema,
  toBaisa,
  toRials,
  type Customer,
  type CreateCustomerInput,
  type LedgerDirection,
} from '@suarza-oman/shared';
import { IconCheck } from '@tabler/icons-react';
import { ApiError } from '../../lib/api.js';
import { useCreateCustomer, useUpdateCustomer } from '../../lib/customers.js';

export interface CustomerModalProps {
  opened: boolean;
  onClose: () => void;
  /** Absent means "create"; present means "edit this one". */
  customer?: Customer | null;
  /** Opened from the vendors screen, so the box starts ticked. */
  defaultVendor?: boolean;
}

/* Typed as the input the API takes, so the form and the request cannot
   disagree about what a customer is. Amounts are typed in rials here and
   converted to baisa on the way out. */
interface FormValues extends CreateCustomerInput {
  opening_balance: number | string;
  opening_balance_direction: LedgerDirection;
  previous_year_balance: number | string;
}

const EMPTY: FormValues = {
  name: '',
  company: '',
  email: '',
  phone: '',
  vat_number: '',
  notes: '',
  status: 'ACTIVE',
  pay_mode: 'CASH',
  is_vendor: false,
  previous_year_balance_baisa: 0,
  previous_year_balance_direction: 'DEBIT',
  opening_balance: '',
  opening_balance_direction: 'DEBIT',
  previous_year_balance: '',
};

const PAY_MODE_OPTIONS = PAY_MODES.map((mode) => ({ value: mode, label: PAY_MODE_LABELS[mode] }));

/** Runs one field through the shared schema and returns its message, if any. */
function fieldError(field: 'name' | 'phone' | 'email', value: unknown): string | null {
  const result = createCustomerSchema.shape[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Check this field');
}

/** The same two words the ledger uses everywhere else, and in the same order. */
const SIDE_OPTIONS = [
  { value: 'DEBIT', label: 'Debit' },
  { value: 'CREDIT', label: 'Credit' },
];

export function CustomerModal({
  opened,
  onClose,
  customer,
  defaultVendor = false,
}: CustomerModalProps) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const editing = Boolean(customer);

  const form = useForm<FormValues>({
    mode: 'uncontrolled',
    initialValues: EMPTY,
    /*
     * Checked against the shared schema field by field: the form holds two
     * extra inputs (amounts in rials) that the customer schema knows nothing
     * about, so the whole-object resolver cannot be used — but the rules for
     * the fields it does own still come from one place.
     */
    validate: {
      name: (value) => fieldError('name', value),
      phone: (value) => fieldError('phone', value),
      email: (value) => fieldError('email', value),
    },
  });

  /* Reopening on a different row must not show the previous row's values —
     the modal stays mounted, so the reset is explicit. */
  useEffect(() => {
    if (!opened) return;
    form.setValues(
      customer
        ? {
            ...EMPTY,
            name: customer.name,
            company: customer.company,
            email: customer.email,
            phone: customer.phone,
            vat_number: customer.vat_number,
            notes: customer.notes,
            status: customer.status,
            pay_mode: customer.pay_mode,
            is_vendor: customer.is_vendor,
            previous_year_balance_direction: customer.previous_year_balance_direction,
            previous_year_balance:
              customer.previous_year_balance_baisa > 0
                ? toRials(customer.previous_year_balance_baisa)
                : '',
          }
        : { ...EMPTY, is_vendor: defaultVendor },
    );
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, customer?.id, defaultVendor]);

  const submit = form.onSubmit(async (values) => {
    const { opening_balance, opening_balance_direction, previous_year_balance, ...rest } = values;
    const asBaisa = (amount: number | string) => {
      const value = typeof amount === 'string' ? Number(amount) : amount;
      return Number.isFinite(value) && value > 0 ? toBaisa(value) : 0;
    };

    const payload = {
      ...rest,
      previous_year_balance_baisa: asBaisa(previous_year_balance),
    };

    try {
      if (customer) {
        // No opening balance on an edit: it is already a ledger entry, and
        // sending it again would post a second one.
        await update.mutateAsync({ id: customer.id, input: payload });
      } else {
        await create.mutateAsync({
          ...payload,
          opening_balance_baisa: asBaisa(opening_balance),
          opening_balance_direction,
        });
      }
      notifications.show({
        title: editing ? 'Customer updated' : 'Customer added',
        message: values.name,
        color: 'brand',
        icon: <IconCheck size={16} />,
      });
      onClose();
    } catch (error) {
      // A 422 names its fields: show them on the inputs, where the fix is.
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

  const busy = create.isPending || update.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `Edit ${customer?.name}` : defaultVendor ? 'New vendor' : 'New customer'}
      size="lg"
    >
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Name"
              placeholder="Ahmed Al Balushi"
              withAsterisk
              data-autofocus
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Company"
              placeholder="Al Balushi Trading LLC"
              {...form.getInputProps('company')}
            />
            <TextInput
              label="Mobile"
              placeholder="+968 9123 4567"
              withAsterisk
              {...form.getInputProps('phone')}
            />
            <TextInput
              label="Email"
              placeholder="ahmed@company.om"
              {...form.getInputProps('email')}
            />
            <TextInput
              label="VAT number"
              placeholder="OM1100123456"
              {...form.getInputProps('vat_number')}
            />
            <Select
              label="Pay mode"
              data={PAY_MODE_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('pay_mode')}
            />
            <Select
              label="Status"
              data={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]}
              allowDeselect={false}
              {...form.getInputProps('status')}
            />
          </SimpleGrid>

          <Divider label="Balances" labelPosition="left" />

          {/* Amount and side sit together, because neither means anything on
              its own — 250.000 is owed or owing depending on the box beside it. */}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <NumberInput
                label="Opening balance"
                placeholder="0.000"
                prefix="OMR "
                min={0}
                decimalScale={3}
                thousandSeparator=","
                disabled={editing}
                style={{ flex: 1, minWidth: 0 }}
                {...form.getInputProps('opening_balance')}
              />
              <Select
                label="Side"
                data={SIDE_OPTIONS}
                allowDeselect={false}
                disabled={editing}
                w={150}
                {...form.getInputProps('opening_balance_direction')}
              />
            </Group>

            <Group gap="xs" wrap="nowrap" align="flex-end">
              <NumberInput
                label="Previous year balance"
                placeholder="0.000"
                prefix="OMR "
                min={0}
                decimalScale={3}
                thousandSeparator=","
                style={{ flex: 1, minWidth: 0 }}
                {...form.getInputProps('previous_year_balance')}
              />
              <Select
                label="Side"
                data={SIDE_OPTIONS}
                allowDeselect={false}
                w={150}
                {...form.getInputProps('previous_year_balance_direction')}
              />
            </Group>
          </SimpleGrid>

          <Text fz="xs" c="dimmed" mt={-8}>
            {editing
              ? 'The opening balance was added to this customer’s account when you created them. Change it there, not here.'
              : 'The opening balance starts their account. Last year’s figure is only for reference and does not change the balance.'}
          </Text>

          <Checkbox
            label="List this customer in the Vendor list"
            description="They stay one record with one account. This just adds them to Vendors too."
            {...form.getInputProps('is_vendor', { type: 'checkbox' })}
          />

          <Textarea
            label="Notes"
            placeholder="Anything the team should know about this customer"
            autosize
            minRows={2}
            maxRows={6}
            {...form.getInputProps('notes')}
          />

          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {editing ? 'Save changes' : 'Add customer'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
