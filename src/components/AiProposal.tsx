import { useCallback, useState } from 'react'
import { validateAiAction, type AiAction } from '../ai/actions.ts'
import type { AiHarnessResponse } from '../bridge.ts'

export type AiProposalProps = {
  response: AiHarnessResponse
  availableColumns: string[]
  onAccept: (action: AiAction) => void
  onRefuse: () => void
}

export function AiProposal({ response, availableColumns, onAccept, onRefuse }: AiProposalProps) {
  const [accepting, setAccepting] = useState(false)

  const handleAccept = useCallback(async () => {
    setAccepting(true)
    try {
      onAccept(response.proposal as AiAction)
    } finally {
      setAccepting(false)
    }
  }, [response.proposal, onAccept])

  const action = response.proposal as Record<string, unknown>
  const validationError = validateAiAction(action, availableColumns)

  return (
    <div className="ai-proposal-overlay">
      <div className="ai-proposal-card">
        <div className="ai-proposal-header">
          <h3>Proposition AI</h3>
          {response.deterministic && (
            <span className="ai-badge">Simulation (pas de clé API)</span>
          )}
        </div>
        
        <div className="ai-proposal-body">
          <div className="ai-proposal-action">
            <strong>Action:</strong> {action.type as string}
          </div>
          <pre className="ai-proposal-json">{JSON.stringify(action, null, 2)}</pre>
          
          {validationError && (
            <div className="ai-proposal-error">
              <strong>Erreur de validation:</strong> {validationError}
            </div>
          )}
        </div>
        
        <div className="ai-proposal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefuse}
            disabled={accepting}
          >
            Refuser
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={accepting || Boolean(validationError)}
          >
            {accepting ? 'Exécution...' : 'Accepter'}
          </button>
        </div>
      </div>
    </div>
  )
}
