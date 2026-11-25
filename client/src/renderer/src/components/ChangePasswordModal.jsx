import { useEffect } from 'react'
import Modal, { ModalHeader } from './Modal'
import { useAuth } from '../context/AuthContext'
import { changePassword } from '../api/authApi'
import { usePasswordMinLength } from '../api/accountStore'
import { z } from 'zod'
import { useZodForm } from '../lib/zodForm'
import Field from './ui/Field'
import { ErrorNote } from './DataState'

// Kiểm ở máy trước khi gửi; độ dài tối thiểu lấy theo cài đặt bảo mật của server (usePasswordMinLength).
export const passwordSchema = (minLength) =>
  z
    .object({
      old: z.string().min(1, 'Enter your current password.'),
      np: z.string().min(minLength, 'The new password is too short.'),
      np2: z.string()
    })
    .refine((v) => v.np === v.np2, { path: ['np2'], message: 'The two new passwords do not match.' })

// Đổi xong server thu hồi mọi token → về màn đăng nhập.
export default function ChangePasswordModal({ open, onClose }) {
  const { user: me, signOutAfterPasswordChange } = useAuth()
  const minLength = usePasswordMinLength()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useZodForm(passwordSchema(minLength), { defaultValues: { old: '', np: '', np2: '' } })

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const submit = handleSubmit(async ({ old, np }) => {
    const res = await changePassword(me, old, np)
    if (!res.ok) return setError('root', { message: res.error })
    signOutAfterPasswordChange()
  })

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <form onSubmit={submit} noValidate>
        <ModalHeader title="Change your password" onClose={onClose} />
        <div className="modal-b">
          <ErrorNote className="mb-12">{errors.root?.message}</ErrorNote>
          <div className="fg">
            <Field full label="Current password" error={errors.old}>
              <input className="input" type="password" autoFocus autoComplete="current-password" {...register('old')} />
            </Field>
            <Field full label={`New password (at least ${minLength} characters)`} error={errors.np}>
              <input className="input" type="password" autoComplete="new-password" {...register('np')} />
            </Field>
            <Field full label="Confirm new password" error={errors.np2}>
              <input className="input" type="password" autoComplete="new-password" {...register('np2')} />
            </Field>
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button data-shortcut="save" type="submit" className="btn btn-primary" disabled={isSubmitting}>
            Change password
          </button>
        </div>
      </form>
    </Modal>
  )
}
