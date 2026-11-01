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
    <div>
      <div className="breadcrumb">
        Inventory / <b>Stock &amp; expiry</b>
      </div>
      <div className="page-head">
        <div>
          <h1>Stock &amp; expiry</h1>
          <p>Stock by batch, expiry dates and every stock movement. Drug master data lives in Catalog management › Drugs &amp; supplies.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('drugs')}>
          <Icon name="folder" /> <span>Drug catalog</span>
        </button>
      </div>

      <div className="card">
        <div className="itabs ai-tabs">
          <button className={'itab' + (tab === 'stock' ? ' active' : '')} onClick={() => setTab('stock')}>
            Stock by batch
          </button>
          <button className={'itab' + (tab === 'moves' ? ' active' : '')} onClick={() => setTab('moves')}>
            Stock movements
          </button>
        </div>
        {tab === 'stock' && <StockTab inv={inv} user={user} onNavigate={onNavigate} />}
        {tab === 'moves' && <MovesTab inv={inv} />}
      </div>
    </div>
  )
}

