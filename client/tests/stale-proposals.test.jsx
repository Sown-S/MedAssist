import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '../src/renderer/src/i18n/index.js'
import SymptomPanel from '../src/renderer/src/components/SymptomPanel.jsx'
import VitalProposals from '../src/renderer/src/components/VitalProposals.jsx'
import { extractionStale } from '../src/renderer/src/api/symptoms'
import { installFakeServer } from './fakeServer'

beforeAll(() => installFakeServer())
afterEach(() => cleanup())
afterAll(() => vi.unstubAllGlobals())

const A = 'sốt 39 độ, ho khan, huyết áp 140/90'
const B = 'không sốt, không ho'
const result = (textChanged = false) => ({
  proposals: [{ symptom_code: 'fever', state: 'PRESENT', phrase: 'sốt' }],
  unsure: [],
  vitalProposals: [
    { key: 'temperature_c', value: 39, evidence: '39 độ', group: null },
    { key: 'systolic_bp_mmhg', value: 140, evidence: '140/90', group: 'blood_pressure' },
    { key: 'diastolic_bp_mmhg', value: 90, evidence: '140/90', group: 'blood_pressure' }
  ],
  textChanged
})

// Nối SymptomPanel + VitalProposals như IntakeModal / EditWaitingModal.
function Harness({ onExtract, vitals = {} }) {
  const [text, setText] = useState(A)
  const [syms, setSyms] = useState({})
  const [form, setForm] = useState(vitals)
  const [vp, setVp] = useState({ list: [], from: null })
  return (
    <>
      <SymptomPanel value={syms} onChange={setSyms} text={text} onText={setText} onExtract={onExtract} onVitals={(list, from) => setVp({ list, from })} />
      <VitalProposals
        list={vp.list}
        form={form}
        onApply={(fill) => setForm((f) => ({ ...f, ...fill }))}
        onDrop={(keys) => setVp((v) => ({ ...v, list: v.list.filter((p) => !keys.includes(p.key)) }))}
        stale={extractionStale(vp.from, text)}
      />
      <output data-testid="syms">{JSON.stringify(syms)}</output>
      <output data-testid="form">{JSON.stringify(form)}</output>
    </>
  )
}

const syms = () => JSON.parse(screen.getByTestId('syms').textContent)
const form = () => JSON.parse(screen.getByTestId('form').textContent)
const typeText = (t) => fireEvent.change(screen.getByRole('textbox'), { target: { value: t } })
const runExtract = () => fireEvent.click(screen.getByText('Suggest symptoms from description'))
const confirmAll = () => screen.getByText('Confirm all').closest('button')
const fillAll = () => screen.getByText('Fill empty fields').closest('button')

function expectLocked() {
  expect(confirmAll().disabled).toBe(true)
  expect(fillAll().disabled).toBe(true)
  for (const b of screen.getAllByTitle('Confirm')) expect(b.disabled).toBe(true)
  fireEvent.click(confirmAll())
  fireEvent.click(fillAll())
  for (const b of screen.getAllByTitle('Confirm')) fireEvent.click(b)
  expect(syms()).toEqual({})
  expect(form()).toEqual({})
}

describe('Đề xuất từ lời kể đã cũ', () => {
  it('server trả text_changed=true → không xác nhận được triệu chứng lẫn sinh hiệu', async () => {
    render(<Harness onExtract={async () => result(true)} />)
    runExtract()
    await screen.findByText('Confirm all')
    expect(screen.getByText(/The description changed after the last suggestion/)).toBeTruthy()
    expect(screen.getByText(/The description changed — run the suggestion again/)).toBeTruthy()
    expectLocked()
  })

  it('sửa lời kể sau khi có kết quả → đề xuất cũ không áp dụng được', async () => {
    render(<Harness onExtract={async () => result()} />)
    runExtract()
    await screen.findByText('Confirm all')
    expect(confirmAll().disabled).toBe(false)
    typeText(B)
    expectLocked()
  })

  it('sửa lời kể trong lúc chờ trích xuất → kết quả về là đã cũ', async () => {
    let finish
    render(<Harness onExtract={() => new Promise((ok) => (finish = ok))} />)
    runExtract()
    typeText(B)
    await act(async () => finish(result()))
    expectLocked()
  })

  it('trích xuất lại với lời kể mới → xác nhận được kết quả mới', async () => {
    const onExtract = vi.fn(async () => result())
    render(<Harness onExtract={onExtract} />)
    runExtract()
    await screen.findByText('Confirm all')
    typeText(B)
    expect(confirmAll().disabled).toBe(true)
    runExtract()
    await vi.waitFor(() => expect(confirmAll().disabled).toBe(false))
    expect(onExtract).toHaveBeenLastCalledWith(B, expect.anything())
    expect(screen.queryByText(/The description changed/)).toBeNull()
    fireEvent.click(confirmAll())
    fireEvent.click(fillAll())
    expect(syms()).toEqual({ fever: { state: 'PRESENT', source: 'Extracted' } })
    expect(form()).toEqual({ temperature_c: '39', systolic_bp_mmhg: '140', diastolic_bp_mmhg: '90' })
  })

  it('sinh hiệu đã nhập không bị ghi đè; huyết áp chỉ điền khi cả cặp còn trống', async () => {
    render(<Harness onExtract={async () => result()} vitals={{ temperature_c: '37.5', systolic_bp_mmhg: '120' }} />)
    runExtract()
    await screen.findByText('Confirm all')
    expect(screen.getAllByText(/already entered — kept/)).toHaveLength(2)
    expect(screen.queryByText('Fill empty fields')).toBeNull()
    expect(form()).toEqual({ temperature_c: '37.5', systolic_bp_mmhg: '120' })
  })

  it('đã xác nhận trước khi sửa lời kể → giữ nguyên, vẫn nhập tay được', async () => {
    render(<Harness onExtract={async () => result()} />)
    runExtract()
    await screen.findByText('Confirm all')
    fireEvent.click(screen.getAllByTitle('Confirm')[0])
    expect(syms()).toEqual({ fever: { state: 'PRESENT', source: 'Extracted' } })
    typeText(B)
    expect(syms()).toEqual({ fever: { state: 'PRESENT', source: 'Extracted' } })
    expect(fillAll().disabled).toBe(true)
  })
})
