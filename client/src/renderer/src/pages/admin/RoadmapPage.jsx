// Danh sách “ngoài phạm vi” của Proposal (mục 6.2) và các mục Architecture ghi vào lộ trình, để làm rõ ranh giới dự án.
import Icon from '../../components/Icon'

const ITEMS = [
  {
    icon: 'alert',
    title: 'Drug interaction and dose checking',
    desc: 'Checking each prescription for drug–drug interactions, cross-allergies, contraindications with chronic conditions and dose limits, against a pharmacist-reviewed interaction catalog — the current version only shows a read-only allergy / chronic-condition reminder; the doctor reviews the prescription.'
  },
  {
    icon: 'stethoscope',
    title: 'Full health insurance integration',
    desc: 'Online insurance card lookup through the national social insurance assessment portal, with automatic in-network/out-of-network classification — the current version does not handle health insurance.'
  },
  {
    icon: 'wifi',
    title: 'National e-prescription integration',
    desc: 'Submitting electronic prescriptions to the Ministry of Health portal through its standard API — requires a legal-entity account for the clinic, beyond the scope of this prototype.'
  },
  {
    icon: 'globe',
    title: 'Patient portal',
    desc: 'Lets patients book appointments and view results via web/app — the project currently serves internal staff only (3 roles).'
  },
  {
    icon: 'monitor',
    title: 'Hardware: waiting-room queue display & barcode scanners',
    desc: 'Requires physical devices for testing — outside the software-only scope of the project.'
  },
  {
    icon: 'banknote',
    title: 'Automated doctor KPIs / commissions',
    desc: 'Calculating commission percentages by visits / ordered services — depends on clinic-specific financial policy, outside the technical scope.'
  },
  {
    icon: 'megaphone',
    title: 'Advanced CRM (SMS/Zalo, VIP patients, loyalty points)',
    desc: 'Automatic follow-up reminders and patient segmentation — requires integration with a paid third-party messaging service.'
  }
]

export default function RoadmapPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Future roadmap</h1>
          <p>Items outside the current project scope — noted for future expansion after graduation</p>
        </div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ITEMS.map((it) => (
          <div className="roadmap-card" key={it.title}>
            <h4>
              <Icon name={it.icon} /> {it.title} <span className="roadmap-badge">Roadmap</span>
            </h4>
            <p>{it.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
