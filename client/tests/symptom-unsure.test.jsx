import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '../src/renderer/src/i18n/index.js'
import SymptomPanel from '../src/renderer/src/components/SymptomPanel.jsx'
import { installFakeServer } from './fakeServer'

beforeAll(() => installFakeServer())
afterEach(() => cleanup())
afterAll(() => vi.unstubAllGlobals())

// Lời kể “chưa rõ có ho khan không”: server trả UNKNOWN → không thành đề xuất, nhưng phải nhắc hỏi lại thay vì báo “không tìm thấy”.
const unsureOnly = { proposals: [], unsure: [{ symptom_code: 'cough_dry', name: 'Ho khan' }], vitalProposals: [], textChanged: false }

function panel(value = {}) {
  render(<SymptomPanel value={value} onChange={() => {}} text="Chưa rõ có ho khan hay không" onText={() => {}} onExtract={async () => unsureOnly} />)
  fireEvent.click(screen.getByText('Suggest symptoms from description'))
}

describe('Trích xuất có triệu chứng chưa rõ', () => {
  it('nhắc hỏi lại, không báo “không tìm thấy triệu chứng”', async () => {
    panel()
    expect(await screen.findByText(/Not sure — ask the patient again:.*Ho khan/)).toBeTruthy()
    expect(screen.queryByText(/No catalog symptoms found/)).toBeNull()
  })

  it('lễ tân đã chọn Có / Không cho mục đó → không nhắc nữa', async () => {
    panel({ cough_dry: { state: 'ABSENT', source: 'Form' } })
    await screen.findByText('Suggest symptoms from description')
    await new Promise((ok) => setTimeout(ok, 0))
    expect(screen.queryByText(/ask the patient again/)).toBeNull()
  })
})
