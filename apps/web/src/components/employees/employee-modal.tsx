/**
 * Adding and editing staff. One form for both — the fields are the same, and a
 * second component is a second place for them to drift.
 */

import { useEffect } from 'react';
import {
  Autocomplete,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import {
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABELS,
  createEmployeeSchema,
  toBaisa,
  toRials,
  type CreateEmployeeInput,
  type Employee,
} from '@suarza-oman/shared';
import { ApiError } from '../../lib/api.js';
import { useCreateEmployee, useDepartments, useUpdateEmployee } from '../../lib/employees.js';

export interface EmployeeModalProps {
  opened: boolean;
  onClose: () => void;
  employee?: Employee | null;
}

interface FormValues extends Omit<CreateEmployeeInput, 'joined_on'> {
  salary: number | string;
  joined_on: Date | null;
}

const EMPTY: FormValues = {
  name: '',
  code: '',
  designation: '',
  department: '',
  phone: '',
  email: '',
  civil_number: '',
  nationality: '',
  salary_baisa: 0,
  pay_frequency: 'MONTHLY',
  status: 'ACTIVE',
  notes: '',
  salary: '',
  joined_on: null,
};

function fieldError(field: 'name' | 'phone' | 'email', value: unknown): string | null {
  const result = createEmployeeSchema.shape[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Check this field');
}

export function EmployeeModal({ opened, onClose, employee }: EmployeeModalProps) {
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const departments = useDepartments();
  const editing = Boolean(employee);

  const form = useForm<FormValues>({
    mode: 'uncontrolled',
    initialValues: EMPTY,
    validate: {
      name: (value) => fieldError('name', value),
      phone: (value) => fieldError('phone', value),
      email: (value) => fieldError('email', value),
    },
  });

  useEffect(() => {
    if (!opened) return;
    const values: FormValues = employee
      ? {
          ...EMPTY,
          name: employee.name,
          code: employee.code,
          designation: employee.designation,
          department: employee.department,
          phone: employee.phone,
          email: employee.email,
          civil_number: employee.civil_number,
          nationality: employee.nationality,
          pay_frequency: employee.pay_frequency,
          status: employee.status,
          notes: employee.notes,
          salary: employee.salary_baisa > 0 ? toRials(employee.salary_baisa) : '',
          joined_on: employee.joined_on ? new Date(employee.joined_on) : null,
        }
      : EMPTY;
    form.setValues(values);
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, employee?.id]);

  const submit = form.onSubmit(async (values) => {
    const { salary, joined_on, ...rest } = values;
    const amount = typeof salary === 'string' ? Number(salary) : salary;
    const payload = {
      ...rest,
      salary_baisa: Number.isFinite(amount) && amount > 0 ? toBaisa(amount) : 0,
      ...(joined_on ? { joined_on } : {}),
    };

    try {
      if (employee) {
        await update.mutateAsync({ id: employee.id, input: payload });
      } else {
        await create.mutateAsync(payload);
      }
      notifications.show({
        title: editing ? 'Employee updated' : 'Employee added',
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

  const busy = create.isPending || update.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `Edit ${employee?.name}` : 'New employee'}
      size="lg"
    >
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Full name"
              placeholder="Salim Al Hinai"
              withAsterisk
              data-autofocus
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Staff number"
              placeholder="E001"
              description="Optional, but no two can share one"
              {...form.getInputProps('code')}
            />
            <TextInput label="Designation" placeholder="Driver" {...form.getInputProps('designation')} />
            <Autocomplete
              label="Department"
              placeholder="Logistics"
              data={departments.data ?? []}
              {...form.getInputProps('department')}
            />
            <TextInput
              label="Mobile"
              placeholder="+968 9123 4567"
              withAsterisk
              {...form.getInputProps('phone')}
            />
            <TextInput label="Email" placeholder="salim@suarza.om" {...form.getInputProps('email')} />
            <TextInput
              label="Civil number"
              placeholder="12345678"
              description="Or passport number"
              {...form.getInputProps('civil_number')}
            />
            <TextInput label="Nationality" placeholder="Omani" {...form.getInputProps('nationality')} />
          </SimpleGrid>

          <Divider label="Pay and service" labelPosition="left" />

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <NumberInput
              label="Salary"
              placeholder="0.000"
              prefix="OMR "
              min={0}
              decimalScale={3}
              thousandSeparator=","
              {...form.getInputProps('salary')}
            />
            <Select
              label="Paid"
              data={PAY_FREQUENCIES.map((value) => ({ value, label: PAY_FREQUENCY_LABELS[value] }))}
              allowDeselect={false}
              {...form.getInputProps('pay_frequency')}
            />
            <DateInput
              label="Joined on"
              placeholder="Pick a date"
              valueFormat="DD MMM YYYY"
              clearable
              {...form.getInputProps('joined_on')}
            />
          </SimpleGrid>

          <Select
            label="Status"
            data={EMPLOYEE_STATUSES.map((value) => ({ value, label: EMPLOYEE_STATUS_LABELS[value] }))}
            allowDeselect={false}
            {...form.getInputProps('status')}
          />

          <Textarea
            label="Notes"
            placeholder="Anything worth knowing — licence expiry, shift, next of kin"
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
              {editing ? 'Save changes' : 'Add employee'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
