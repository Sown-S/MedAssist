// Danh mục component dùng chung (Ladle). Thêm component vào components/ui thì thêm truyện ở đây.
import { useState } from 'react'
import { z } from 'zod'
import Badge from './Badge'
import EmptyState from './EmptyState'
import Field from './Field'
import Button from '../Button'
import { ErrorNote } from '../DataState'
import { useZodForm } from '../../lib/zodForm'

export default { title: 'Dùng chung' }

export const Badges = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Badge tone="success">Paid</Badge>
    <Badge tone="warning">Waiting</Badge>
    <Badge tone="danger">Emergency</Badge>
    <Badge tone="info">Examining</Badge>
    <Badge>Cancelled</Badge>
  </div>
)

export const Empty = () => (
  <div className="card">
    <EmptyState icon="coffee" title="No one is waiting." text="Patients appear here as soon as reception checks them in.">
      <button className="btn btn-primary">Call next patient</button>
    </EmptyState>
  </div>
)

export const Buttons = () => {
  const slow = () => new Promise((r) => setTimeout(r, 1200))
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button onClick={slow}>Save</Button>
      <Button className="btn btn-outline" onClick={slow}>
        Cancel
      </Button>
      <Button className="btn btn-danger" disabled>
        Delete
      </Button>
    </div>
  )
}

export const Fields = () => (
  <div className="fg" style={{ maxWidth: 520 }}>
    <Field label="Full name">
      <input className="input" />
    </Field>
    <Field label="Phone" hint="10 digits, starts with 0" error="Invalid phone number.">
      <input className="input" defaultValue="09123" />
    </Field>
  </div>
)

const schema = z.object({ name: z.string().min(2, 'Enter the full name.'), phone: z.string().regex(/^0\d{9}$/, 'Invalid phone number.') })
export const FormPattern = () => {
  const [saved, setSaved] = useState(null)
  const { register, handleSubmit, formState } = useZodForm(schema, { defaultValues: { name: '', phone: '' } })
  return (
    <form onSubmit={handleSubmit(setSaved)} noValidate style={{ maxWidth: 420 }}>
      <div className="fg">
        <Field full label="Full name" error={formState.errors.name}>
          <input className="input" {...register('name')} />
        </Field>
        <Field full label="Phone" error={formState.errors.phone}>
          <input className="input" {...register('phone')} />
        </Field>
      </div>
      <button className="btn btn-primary mt-14" type="submit">
        Save
      </button>
      {saved && <ErrorNote tone="w">{JSON.stringify(saved)}</ErrorNote>}
    </form>
  )
}
