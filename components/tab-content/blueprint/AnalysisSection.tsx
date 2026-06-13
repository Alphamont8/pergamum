"use client"

import type { BlueprintAnalysis, RubricAlignmentItem } from '../../../types'
import './AnalysisSection.css'

interface AnalysisSectionProps {
  analysis: BlueprintAnalysis
  locked: boolean
  onUpdate: (patch: Partial<BlueprintAnalysis>) => void
}

type ListKey = keyof Pick<
  BlueprintAnalysis,
  | 'taskWords'
  | 'goals'
  | 'boundaries'
  | 'impliedQuestions'
  | 'suggestedStructure'
  | 'formattingRequirements'
>

const LIST_BLOCKS: { key: ListKey; title: string }[] = [
  { key: 'taskWords', title: 'Task words' },
  { key: 'goals', title: 'Goals' },
  { key: 'boundaries', title: 'Content boundaries' },
  { key: 'impliedQuestions', title: 'Implied questions' },
  { key: 'suggestedStructure', title: 'Suggested structure' },
  { key: 'formattingRequirements', title: 'Formatting requirements' },
]

export function AnalysisSection({ analysis, locked, onUpdate }: AnalysisSectionProps) {
  const updateList = (key: ListKey, index: number, value: string) => {
    const items = [...analysis[key]]
    items[index] = value
    onUpdate({ [key]: items })
  }

  const removeListItem = (key: ListKey, index: number) => {
    onUpdate({ [key]: analysis[key].filter((_, i) => i !== index) })
  }

  const updateRubric = (index: number, patch: Partial<RubricAlignmentItem>) => {
    const rubricAlignment = analysis.rubricAlignment.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    )
    onUpdate({ rubricAlignment })
  }

  return (
    <div className="analysis-section">
      <h4 className="analysis-section__heading">Analysis</h4>
      <div className="analysis-section__grid">
        {LIST_BLOCKS.map(({ key, title }) => (
          <div key={key} className="analysis-section__block">
            <h5 className="analysis-section__block-title">{title}</h5>
            <ul className="analysis-section__list">
              {analysis[key].map((item, i) => (
                <li key={`${key}-${i}`} className="analysis-section__list-item">
                  {locked ? (
                    <span>{item}</span>
                  ) : (
                    <>
                      <input
                        type="text"
                        className="analysis-section__input"
                        value={item}
                        onChange={(e) => updateList(key, i, e.target.value)}
                      />
                      <button
                        type="button"
                        className="analysis-section__remove"
                        aria-label={`Remove ${title} item`}
                        onClick={() => removeListItem(key, i)}
                      >
                        ×
                      </button>
                    </>
                  )}
                </li>
              ))}
              {analysis[key].length === 0 && (
                <li className="analysis-section__empty">None detected</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {analysis.rubricAlignment.length > 0 && (
        <div className="analysis-section__rubric">
          <h5 className="analysis-section__block-title">Rubric alignment</h5>
          <div className="analysis-section__rubric-list">
            {analysis.rubricAlignment.map((item, i) => (
              <div key={`rubric-${i}`} className="analysis-section__rubric-row">
                <span
                  className={`analysis-section__coverage ${item.covered ? 'analysis-section__coverage--yes' : 'analysis-section__coverage--no'}`}
                  title={item.covered ? 'Covered' : 'Not covered'}
                  aria-hidden
                />
                <div className="analysis-section__rubric-content">
                  <strong>{item.criterion}</strong>
                  {locked ? (
                    <p>{item.addressedBy}</p>
                  ) : (
                    <input
                      type="text"
                      className="analysis-section__input"
                      value={item.addressedBy}
                      onChange={(e) => updateRubric(i, { addressedBy: e.target.value })}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
