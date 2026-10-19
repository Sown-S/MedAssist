// Trang này CHỦ ĐÍCH tồn tại để tự vẽ ranh giới phạm vi cho hội đồng — mỗi mục ở đây khớp
// với đúng danh sách "Out-of-scope" trong Proposal (mục 6.2), tránh bị hỏi "sao không làm X".
import Icon from '../../components/Icon'

const ITEMS = [
  {
    icon: 'stethoscope',
    title: 'Full health insurance integration',
    desc: 'Online insurance card lookup through the national social insurance assessment portal, with automatic in-network/out-of-network classification — the current mock UI only supports entering the card number and covered amount manually.'
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
