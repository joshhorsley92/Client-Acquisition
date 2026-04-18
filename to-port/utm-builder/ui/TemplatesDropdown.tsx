'use client'

import { Trash2 } from 'lucide-react'
import type { SavedTemplate } from './utm-constants'

interface TemplatesDropdownProps {
  templates: SavedTemplate[]
  visible: boolean
  onApplyTemplate: (template: SavedTemplate) => void
  onDeleteTemplate: (index: number) => void
}

export default function TemplatesDropdown({
  templates,
  visible,
  onApplyTemplate,
  onDeleteTemplate,
}: TemplatesDropdownProps) {
  if (!visible) return null

  return (
    <>
      {templates.length > 0 ? (
        <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-2">
          {templates.map((t) => (
            <div key={t.name} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
              <button
                onClick={() => onApplyTemplate(t)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-medium text-brand-charcoal">{t.name}</p>
                <p className="text-[11px] text-brand-gray">
                  {t.source} / {t.medium}{t.channelLabel ? ` — ${t.channelLabel}` : ''}
                </p>
              </button>
              <button
                onClick={() => onDeleteTemplate(templates.indexOf(t))}
                className="text-brand-gray hover:text-red-500 p-1 ml-2"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-brand-gray">No saved templates yet. Build a link, then save it as a template for reuse.</p>
      )}
    </>
  )
}
