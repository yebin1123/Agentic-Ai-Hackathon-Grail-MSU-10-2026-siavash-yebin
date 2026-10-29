import type { ResearchProfile } from '../types/crypto'
import { profileOptions } from '../lib/profile'

export const profileLabels = {
  experience: 'Crypto experience', goal: 'Research goal', horizon: 'Research horizon',
  loss_tolerance: 'Willingness to accept losses', loss_capacity: 'Ability to absorb losses',
  liquidity_need: 'Need to access funds', explanation: 'Explanation style',
}
const optionLabel = (value: string) => value.replaceAll('_', ' ')

type Props = {
  profile: ResearchProfile
  enabled: boolean
  remember: boolean
  error: string | null
  disabled?: boolean
  onChange: (profile: ResearchProfile) => void
  onEnabled: (enabled: boolean) => void
  onRemember: (remember: boolean) => void
  onReset: () => void
}

export function ProfilePanel({ profile, enabled, remember, error, disabled, onChange, onEnabled, onRemember, onReset }: Props) {
  return <details className="profile-panel">
    <summary>Optional research profile {enabled ? '(included)' : '(not included)'}</summary>
    <div className="profile-content">
      <p className="form-help-text">Tailor the explanation, not a recommendation. These preferences do not identify safe tokens or predict returns. Do not enter income amounts, wallet details, or credentials.</p>
      <label className="checkbox-label"><input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onEnabled(event.target.checked)} />Include my profile in snapshot research</label>
      <fieldset disabled={disabled} className="profile-fields">
        <legend>Qualitative preferences</legend>
        <label className="form-field" htmlFor="profile-name"><span className="form-label">Display name (optional)</span><input className="form-input" id="profile-name" maxLength={40} value={profile.display_name} onChange={(event) => onChange({ ...profile, display_name: event.target.value })} autoComplete="off" /></label>
        {Object.entries(profileLabels).map(([key, label]) => <label className="form-field" key={key} htmlFor={`profile-${key}`}><span className="form-label">{label}</span><select className="form-input" id={`profile-${key}`} value={profile[key as keyof typeof profileLabels]} onChange={(event) => onChange({ ...profile, [key]: event.target.value })}>
          {profileOptions[key as keyof typeof profileLabels].map((value) => <option key={value} value={value}>{optionLabel(value)}</option>)}
        </select></label>)}
      </fieldset>
      <p className="form-help-text">Willingness is how comfortable you feel with losses. Ability is whether you could absorb them without affecting essential needs. They can differ; unknown is a valid answer.</p>
      <fieldset className="profile-interests" disabled={disabled}><legend>Interests (optional)</legend>{profileOptions.interests.map((interest) => <label className="checkbox-label" key={interest}><input type="checkbox" checked={profile.interests.includes(interest)} onChange={(event) => onChange({ ...profile, interests: event.target.checked ? [...profile.interests, interest] : profile.interests.filter((item) => item !== interest) })} />{optionLabel(interest)}</label>)}</fieldset>
      <label className="checkbox-label"><input type="checkbox" checked={remember} disabled={disabled} onChange={(event) => onRemember(event.target.checked)} />Remember preferences in this browser</label>
      <p className="form-help-text">Only saved when checked. Shared browsers can expose saved preferences. Your research profile is not sent to Gemini free chat.</p>
      <button type="button" className="text-button" disabled={disabled} onClick={onReset}>Reset profile and remove saved preferences</button>
      {error && <p className="form-help-text error-copy" role="status">{error}</p>}
    </div>
  </details>
}

export function ProfileSummary({ profile }: { profile: ResearchProfile }) {
  return <dl className="profile-summary">
    <div><dt>Display name</dt><dd>{profile.display_name || 'Not supplied'}</dd></div>
    {Object.entries(profileLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{optionLabel(profile[key as keyof typeof profileLabels])}</dd></div>)}
    <div><dt>Interests</dt><dd>{profile.interests.length ? profile.interests.map(optionLabel).join(', ') : 'None supplied'}</dd></div>
  </dl>
}
