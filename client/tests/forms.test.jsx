import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, waitFor, render } from '@testing-library/react'
import { z } from 'zod'
import Field from '../src/renderer/src/components/ui/Field.jsx'
import { useZodForm } from '../src/renderer/src/lib/zodForm.js'
import { passwordSchema } from '../src/renderer/src/components/ChangePasswordModal.jsx'

afterEach(() => cleanup())

describe('Field', () => {
  it('nối nhãn, gợi ý và lỗi vào ô nhập cho trình đọc màn hình', () => {
    render(
      <Field label="Phone" hint="10 digits" error="Invalid phone number.">
        <input />
      </Field>
    )
    const input = screen.getByLabelText('Phone')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const ids = input.getAttribute('aria-describedby').split(' ')
    expect(ids.map((id) => document.getElementById(id).textContent)).toEqual(['10 digits', 'Invalid phone number.'])
  })
  it('không lỗi thì không có aria-invalid', () => {
    render(
      <Field label="Name">
        <input />
      </Field>
    )
    expect(screen.getByLabelText('Name').hasAttribute('aria-invalid')).toBe(false)
  })
})

describe('useZodForm', () => {
  function Demo({ onSave }) {
    const { register, handleSubmit, formState } = useZodForm(z.object({ name: z.string().min(2, 'Too short.') }), { defaultValues: { name: '' } })
    return (
      <form onSubmit={handleSubmit(onSave)}>
        <Field label="Name" error={formState.errors.name}>
          <input {...register('name')} />
        </Field>
        <button type="submit">Save</button>
      </form>
    )
  }
  it('chặn gửi và hiện lỗi của schema; hợp lệ thì gửi dữ liệu đã parse', async () => {
    const onSave = vi.fn()
    render(<Demo onSave={onSave} />)
    fireEvent.click(screen.getByText('Save'))
    expect((await screen.findByRole('alert')).textContent).toBe('Too short.')
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'An' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'An' }, expect.anything()))
  })
})

describe('Schema đổi mật khẩu', () => {
  const issues = (v) => passwordSchema(8).safeParse(v).error?.issues.map((i) => `${i.path[0]}: ${i.message}`) ?? []
  it('bắt mật khẩu ngắn và hai mật khẩu mới không khớp', () => {
    expect(issues({ old: 'a', np: 'short', np2: 'short' })).toEqual(['np: The new password is too short.'])
    expect(issues({ old: 'a', np: 'longenough', np2: 'longenougx' })).toEqual(['np2: The two new passwords do not match.'])
    expect(issues({ old: 'a', np: 'longenough', np2: 'longenough' })).toEqual([])
  })
})
