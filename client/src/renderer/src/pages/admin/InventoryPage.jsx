import { useState } from 'react'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useInventory } from '../../api/inventoryStore'
import { StockTab } from './inventory/StockTab'
import { MovesTab } from './inventory/MovesTab'

export default function InventoryPage({ onNavigate }) {
  const [tab, setTab] = useState('stock')
  const inv = useInventory()
  const { user } = useAuth()

  return (
    <div className="vflow">
      <div className="pg-h">
        <div>
          <h2>Stock &amp; expiry</h2>
          <p>Stock by batch, expiry dates and every stock movement. Drug master data lives in Catalog management › Drugs &amp; supplies.</p>
        </div>
        <div className="act">
          <button className="btn btn-outline" onClick={() => onNavigate('drugs')}>
            <Icon name="library" />
            <span>Drug catalog</span>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="utabs">
          <button className={(tab === 'stock' ? 'on' : '')} onClick={() => setTab('stock')}>
            Stock by batch
          </button>
          <button className={(tab === 'moves' ? 'on' : '')} onClick={() => setTab('moves')}>
            Stock movements
          </button>
        </div>
        <div className="card-b">
          {tab === 'stock' && <StockTab inv={inv} user={user} onNavigate={onNavigate} />}
          {tab === 'moves' && <MovesTab inv={inv} />}
        </div>
      </div>
    </div>
  )
}

