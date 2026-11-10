import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import Modal, { ModalHeader } from '../src/renderer/src/components/Modal.jsx'

afterEach(() => cleanup())

function open(onClose) {
  render(
    <Modal open onClose={onClose}>
      <ModalHeader title="Phiếu tiếp đón" onClose={onClose} />
      <input aria-label="name" />
    </Modal>
  )
}

describe('Modal', () => {
  it('bấm ra vùng mờ bên ngoài không đóng modal', () => {
    const onClose = vi.fn()
    open(onClose)
    fireEvent.click(document.querySelector('.modal-overlay'))
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('.modal-box')).toBeTruthy()
  })

  it('nút X vẫn đóng modal', () => {
    const onClose = vi.fn()
    open(onClose)
    fireEvent.click(document.querySelector('.modal-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
