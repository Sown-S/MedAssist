// FILE SINH TỰ ĐỘNG từ tests/contract/openapi.json — đừng sửa tay. Sinh lại: node scripts/contract/gen_zod.mjs
import { z } from 'zod'

export const AwaitingPaymentItem = z.looseObject({
  has_prescription: z.boolean(),
  invoice_code: z.string().nullable(),
  patient_name: z.string(),
  payment_status: z.string().nullable(),
  pending_items: z.number().int(),
  queue_number: z.number().int().nullable(),
  total_amount: z.number().nullable(),
  visit_id: z.string()
})

export const InvoiceHistoryItem = z.looseObject({
  cancelled_at: z.string().nullable(),
  consultation_fee: z.number().nullable(),
  created_at: z.string(),
  drug_fee: z.number().nullable(),
  invoice_code: z.string(),
  invoice_id: z.string(),
  paid_at: z.string().nullable(),
  paraclinical_fee: z.number().nullable(),
  patient_name: z.string(),
  payment_method: z.string(),
  payment_status: z.string(),
  queue_number: z.number().int().nullable(),
  total_amount: z.number().nullable(),
  visit_id: z.string()
})

export const PatientOut = z.looseObject({
  address: z.string().nullable(),
  allergy_notes: z.string().nullable(),
  created_at: z.string(),
  date_of_birth: z.string(),
  full_name: z.string(),
  gender: z.string(),
  id_number: z.string().nullable(),
  medical_history: z.record(z.string(), z.unknown()).nullable(),
  patient_code: z.string(),
  patient_id: z.string(),
  phone: z.string().nullable(),
  updated_at: z.string()
})

export const PatientSummary = z.looseObject({
  date_of_birth: z.string(),
  full_name: z.string(),
  gender: z.string(),
  patient_code: z.string(),
  patient_id: z.string(),
  phone: z.string().nullable()
})

export const PrescriptionListLine = z.looseObject({
  dispense_status: z.string(),
  dosage: z.string(),
  drug_name: z.string(),
  duration_days: z.number().int(),
  frequency: z.string(),
  quantity: z.number().int(),
  unit: z.string()
})

export const PrescriptionListItem = z.looseObject({
  confirmed_at: z.string(),
  drug_total: z.number().nullable(),
  invoice_status: z.string().nullable(),
  invoice_total: z.number().nullable(),
  items: z.array(PrescriptionListLine),
  patient_code: z.string(),
  patient_name: z.string(),
  physician_id: z.string(),
  physician_name: z.string(),
  prescription_id: z.string(),
  queue_number: z.number().int().nullable(),
  status: z.string(),
  visit_date: z.string(),
  visit_id: z.string()
})

export const QueueItem = z.looseObject({
  ai_status: z.string(),
  called_at: z.string().nullable().optional(),
  called_by: z.string().nullable().optional(),
  called_by_name: z.string().nullable().optional(),
  called_room: z.string().nullable().optional(),
  called_room_name: z.string().nullable().optional(),
  checked_in_at: z.string().nullable(),
  chief_complaint: z.string(),
  date_of_birth: z.string(),
  exam_started_at: z.string().nullable(),
  finished_at: z.string().nullable().optional(),
  gender: z.string(),
  intake_saved: z.boolean(),
  is_red_flag: z.boolean(),
  lab_out_at: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  patient_id: z.string(),
  patient_name: z.string(),
  physician_id: z.string().nullable(),
  physician_name: z.string().nullable(),
  priority_raised_by_ai: z.boolean(),
  queue_date: z.string(),
  queue_number: z.number().int().nullable(),
  red_flag_reason: z.string().nullable(),
  referred_by_role: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  room_name: z.string().nullable().optional(),
  status: z.string(),
  triage_priority: z.string().nullable(),
  visit_date: z.string(),
  visit_id: z.string()
})
